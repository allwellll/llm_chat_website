// No history writes to localStorage: original keys remain an untouched migration backup.
const groups={conversation:'conversations',project:'projects',artifact:'artifacts'};
const marker='claude_pg_migrated_v1';
const keyOf=(kind,id)=>`${kind}:${id}`;
const overlay=(full,summary,kind,baseline={})=>{const result={...full};for(const f of kind==='conversation'?['title','isStarred','projectId','updatedAt']:kind==='project'?['name','updatedAt']:['title']){if(summary[f]===undefined)delete result[f];else result[f]=summary[f];}if(kind==='project')for(const f of ['description','customInstructions','files']){if(!equal(summary[f],baseline[f]) && Object.hasOwn(summary,f))result[f]=summary[f];}delete result._historyUnloaded;return result;};
const equal=(a,b)=>a===b||JSON.stringify(a)===JSON.stringify(b);
const durableData=data=>data?.messages ? {...data,messages:data.messages.map(m=>({...m,isStreaming:false,isThinking:false,thinkingStatus:undefined}))} : data;
export function readLegacy(storage){
 const result={conversations:[],projects:[],artifacts:[]};
 for(const [kind,group] of Object.entries(groups)){
  const suffix=kind==='conversation'?'conversations':kind==='project'?'projects':'artifacts';
  // Include both generations, never discard an alternate key's unique records.
  const seen=new Set();
  for(const prefix of ['claude','aether']){
   const raw=storage.getItem(`${prefix}_${suffix}_v3`);if(!raw)continue;
   const data=JSON.parse(raw);if(!Array.isArray(data))throw Error('Invalid local history');
   for(const item of data){if(!item||typeof item.id!=='string')throw Error('Invalid local history');if(!seen.has(item.id)){seen.add(item.id);result[group].push(item);}}
  }
 }
 return result;
}
export async function historyRequest(path,options){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch(`${import.meta.env?.BASE_URL || '/'}${path.replace(/^\//,'')}`,{...options,credentials:'same-origin',signal:controller.signal,headers:{'Content-Type':'application/json'}});
  const body=await response.json();
  if(!response.ok&&response.status!==409)throw Error(response.status===413?'单条历史超过 9MB，请导出备份并缩减附件。':`历史同步失败（${response.status}）。`);
  if(!body || (!body.record&&!Array.isArray(body.records)))throw Error('历史响应无效。');
  return body;
 }finally{clearTimeout(timer);}
}
export class HistorySync{
 constructor({request=historyRequest,storage=globalThis.localStorage,onChange=()=>{},onStatus=()=>{}}={}){
  this.request=request;this.storage=storage;this.onChange=onChange;this.onStatus=onStatus;
  this.local=new Map();this.remote=new Map();this.dirty=new Map();this.deferred=new Map();this.ready=false;this.error='';this.notice='';this.busy=null;this.loading=null;this.next=null;this.cursor='0';this.details=new Map();this.refreshing=null;
 }
 status(){this.onStatus({ready:this.ready,error:this.error,notice:this.notice,pending:this.dirty.size,saving:!!this.busy});}
 snapshot(){const s={conversations:[],projects:[],artifacts:[]};for(const [key,data]of this.local)s[groups[key.split(':')[0]]].push(data);return s;}
 emit(){this.onChange(this.snapshot());this.status();}
 async start(){
  if(this.loading)return this.loading;
  this.loading=this.initialize().finally(()=>{this.loading=null;});return this.loading;
 }
 async initialize(){
  try{
   // A failed GET must never be interpreted as an empty workspace.
   const first=await this.request('/api/history?limit=30');
   let imported=false;
   if(!this.storage.getItem(marker)){
    const legacy=readLegacy(this.storage);
    const known=new Set(first.records.map(r=>keyOf(r.kind,r.id)));
    for(const [kind,group]of Object.entries(groups))for(const data of legacy[group]){
     if(!known.has(keyOf(kind,data.id)))await this.request(`/api/history/${kind}/${data.id}`,{method:'PUT',body:JSON.stringify({version:0,data:durableData(data),importOnly:true})});
    }
    // Marker only after every import was acknowledged. Originals deliberately retained.
    this.storage.setItem(marker,'1');imported=true;
   }
   const page=imported?await this.request('/api/history?limit=30'):first;this.next=page.next;this.cursor=page.cursor||'0';this.merge(page.records);this.ready=true;this.error='';this.emit();
  }catch(error){this.error='历史加载或迁移失败。未清除本机原始记录；请重试。'+(error?.message||'');this.status();}
 }
 materialize(r){
  if(!r.summary)return r.data;
  return {...r.data,_historyUnloaded:true,...(r.kind==='conversation'?{messages:[]}:r.kind==='project'?{files:[]}:{content:''})};
 }
 merge(records){
  for(const r of records){const key=keyOf(r.kind,r.id);if((this.remote.get(key)?.version||0)>r.version){if((this.deferred.get(key)?.version||0)<=this.remote.get(key).version)this.deferred.delete(key);continue;}
   if(this.dirty.has(key)||this.local.get(key)?.messages?.some(m=>m.isStreaming)){if((this.deferred.get(key)?.version||0)<r.version)this.deferred.set(key,r);continue;}
   const deferred=this.deferred.get(key);if(deferred?.version>r.version)continue;this.deferred.delete(key);
   const old=this.remote.get(key);if(old?.version===r.version&&this.local.has(key))continue;
   this.remote.set(key,r);if(r.deleted)this.local.delete(key);else {const wasLoaded=this.local.has(key)&&!this.local.get(key)?._historyUnloaded;this.local.set(key,this.materialize(r));if(wasLoaded&&r.summary)void this.load(r.kind,r.id).catch(()=>{});}
  }
 }
 async load(kind,id){
  const key=keyOf(kind,id);const local=this.local.get(key);if(local&&!local._historyUnloaded)return local;
  if(this.details.has(key))return this.details.get(key);
  const promise=(async()=>{
   const {record}=await this.request(`/api/history/${kind}/${id}`);
   if(record.deleted){if(!this.dirty.has(key)){this.remote.set(key,record);this.local.delete(key);this.emit();}throw Error('此记录已删除');}
   if((this.remote.get(key)?.version||0)>record.version)throw Error('历史已更新，请重试');
   if(!this.dirty.has(key)){this.remote.set(key,record);this.local.set(key,record.data);this.emit();return record.data;}
   return record.data;
  })().finally(()=>this.details.delete(key));this.details.set(key,promise);return promise;
 }
 async more(){if(!this.next)return;const page=await this.request(`/api/history?limit=30&cursor=${encodeURIComponent(this.next)}`);this.next=page.next;this.merge(page.records);this.emit();}
 async search(q,cursor){const page=await this.request(`/api/history?kind=conversation&limit=30&q=${encodeURIComponent(q)}${cursor?'&cursor='+encodeURIComponent(cursor):''}`);this.merge(page.records);this.emit();return page;}
 async clearConversations(){
  // Explicit clear-all visits summaries, not bodies; ordinary refresh never walks all pages.
  let cursor;do {const page=await this.request(`/api/history?kind=conversation&limit=100${cursor?'&cursor='+encodeURIComponent(cursor):''}`);this.merge(page.records);cursor=page.next;}while(cursor);
  for(const [key,data] of this.local)if(key.startsWith('conversation:')){this.dirty.set(key,{data:null,version:this.remote.get(key)?.version||0});this.local.delete(key);}this.emit();await this.flush();
 }
 update(snapshot){
  if(!this.ready)return;
  const next=new Map();for(const[kind,group]of Object.entries(groups))for(const data of snapshot[group])next.set(keyOf(kind,data.id),data);
  for(const key of new Set([...this.local.keys(),...next.keys()])){
   const data=next.get(key)||null;if(equal(this.local.get(key)||null,data))continue;
   const existing=this.dirty.get(key);this.dirty.set(key,{data,version:existing?.version??this.remote.get(key)?.version??0,baseline:existing?.baseline??this.local.get(key)});
  }
  this.local=next;this.status();
 }
 async refresh(){
  if(!this.ready)return this.start();if(this.refreshing)return this.refreshing;
  // One bounded change page per poll. The next poll resumes; never load-all on boot/focus.
  this.refreshing=(async()=>{try{const page=await this.request(`/api/history/changes?limit=100&cursor=${this.cursor}`);this.merge(page.records);this.merge([...this.deferred.values()]);this.cursor=page.cursor||this.cursor;this.error='';this.emit();}catch{this.error='无法刷新云端历史，请重试。';this.status();}})().finally(()=>this.refreshing=null);return this.refreshing;
 }
 async flush(){
  if(!this.ready)return this.start();if(this.busy)return this.busy;
  this.busy=this.upload().finally(()=>{this.busy=null;this.status();});this.status();return this.busy;
 }
 async upload(){
  const failed=new Set();let lastError='';
  while([...this.dirty.keys()].some(key=>!failed.has(key))){
    const [key,pending]=[...this.dirty.entries()].find(([key])=>!failed.has(key));const [kind,id]=key.split(':');
    try{
    let uploadData=pending.data;let deletedRemote=null;
    if(uploadData?._historyUnloaded){
     const {record:full}=await this.request(`/api/history/${kind}/${id}`);
     if(full.deleted){deletedRemote=full;uploadData=null;}else {
      uploadData=overlay(full.data,pending.data,kind,pending.baseline);
     }
    }
    const {record}=deletedRemote?{record:{...deletedRemote,conflict:true}}:await this.request(`/api/history/${kind}/${id}`,{method:pending.data===null?'DELETE':'PUT',body:JSON.stringify({version:pending.version,...(pending.data===null?{}:{data:durableData(uploadData)})})});
    const latest=this.dirty.get(key);
    if(record.conflict){
     // Preserve the newest local edit, including edits made while this request was in flight.
     if(latest?.data&&(!latest.data._historyUnloaded||uploadData)){
      const copy={...(latest.data._historyUnloaded?overlay(uploadData,latest.data,kind,latest.baseline):latest.data),id:`${kind}-conflict-${globalThis.crypto.randomUUID()}`};
      if(kind==='conversation'||kind==='artifact')copy.title=(copy.title||'').slice(0,1900)+'（冲突副本）';else copy.name=(copy.name||'').slice(0,1900)+'（冲突副本）';
      const copyKey=keyOf(kind,copy.id);this.local.set(copyKey,copy);this.dirty.set(copyKey,{data:copy,version:0});
     }
     this.dirty.delete(key);this.remote.set(key,record);
     if(record.deleted)this.local.delete(key);else this.local.set(key,record.data);
     this.notice='检测到另一设备修改或删除：未覆盖云端。您的编辑已保留为冲突副本；过期删除已取消。';this.emit();
    }else{
     this.remote.set(key,record);
     if(latest===pending){this.dirty.delete(key);if(pending.data?._historyUnloaded){this.local.set(key,record.data);this.emit();}}
     else if(latest)this.dirty.set(key,{...latest,version:record.version});
    }
    }catch(error){failed.add(key);lastError=error?.message||'';}
   }
  const beforeReplay=new Map(this.local);
  this.merge([...this.deferred.values()]);
  this.error=failed.size ? '历史尚未保存！编辑仍在本页内存中，请勿关闭或刷新。请重试同步。'+lastError : '';
  if(beforeReplay.size!==this.local.size||[...this.local].some(([key,data])=>beforeReplay.get(key)!==data))this.emit();else this.status();
 }
}
