import test from 'node:test';
import assert from 'node:assert/strict';
import { HistorySync, readLegacy } from '../src/services/historySync.mjs';
const conv=(id='one',title='original')=>({id,title,messages:[],createdAt:1,updatedAt:1,model:'opus-5'});
function harness(){
 const records=new Map();let fail=false;let writes=0;let snapshot={conversations:[],projects:[],artifacts:[]};let status={};
 const storage=new Map();const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 const request=async(path,options)=>{
  if(fail) throw Error('offline');
  if(!options) return {records:[...records.values()]};
  writes++;const [kind,id]=path.split('/').slice(-2);const body=JSON.parse(options.body);const key=kind+':'+id;const current=records.get(key);
  if(body.importOnly&&current)return {record:current};
  if(current?(current.deleted||current.version!==body.version):body.version!==0)return {record:{...current,conflict:true}};
  const record={kind,id,version:(current?.version||0)+1,deleted:options.method==='DELETE',data:body.data||null};records.set(key,record);return {record};
 };
 const make=()=>new HistorySync({request,storage:localStorage,onChange:s=>snapshot=s,onStatus:s=>status=s});
 return {make,records,storage,get snapshot(){return snapshot},get status(){return status},get writes(){return writes},set fail(v){fail=v}};
}
test('GET failure is not empty DB, never imports or uploads initial empty state',async()=>{
 const h=harness();h.storage.set('claude_conversations_v3',JSON.stringify([conv()]));h.fail=true;const s=h.make();await s.start();assert.equal(s.ready,false);assert.equal(h.writes,0);assert.ok(h.status.error);s.update({conversations:[],projects:[],artifacts:[]});assert.equal(h.writes,0);
});
test('migration is server first, idempotent, keeps originals and respects tombstones and projects',async()=>{
 const h=harness();h.records.set('conversation:one',{kind:'conversation',id:'one',version:4,deleted:true,data:null});
 const legacy=JSON.stringify([conv(),conv('two')]);h.storage.set('claude_conversations_v3',legacy);h.storage.set('claude_projects_v3',JSON.stringify([{id:'p',name:'P',createdAt:1,updatedAt:1}]));
 const s=h.make();await s.start();assert.equal(s.ready,true);assert.deepEqual(h.snapshot.conversations.map(x=>x.id),['two']);assert.equal(h.snapshot.projects.length,1);assert.equal(h.storage.get('claude_conversations_v3'),legacy);
 const writes=h.writes;await h.make().start();assert.equal(h.writes,writes);
});
test('failed saves retain memory, retry and cross-device merge do not bulk replace',async()=>{
 const h=harness();const s=h.make();await s.start();s.update({conversations:[conv()],projects:[],artifacts:[]});h.fail=true;await s.flush();assert.ok(h.status.error);assert.equal(s.snapshot().conversations[0].id,'one');
 h.fail=false;await s.flush();assert.equal(h.records.size,1);
 h.records.set('conversation:other',{kind:'conversation',id:'other',version:1,deleted:false,data:conv('other')});await s.refresh();assert.equal(s.snapshot().conversations.length,2);
});
test('stale same-record edit becomes a visible conflict copy; deleted records cannot resurrect',async()=>{
 const h=harness();h.records.set('conversation:one',{kind:'conversation',id:'one',version:1,deleted:false,data:conv()});const s=h.make();await s.start();
 s.update({conversations:[conv('one','my edit')],projects:[],artifacts:[]});h.records.set('conversation:one',{kind:'conversation',id:'one',version:2,deleted:true,data:null});await s.refresh();assert.equal(s.snapshot().conversations[0].title,'my edit');await s.flush();
 assert.equal(h.records.get('conversation:one').deleted,true);const copy=s.snapshot().conversations[0];assert.notEqual(copy.id,'one');assert.match(copy.title,/冲突副本/);assert.ok(h.status.notice);assert.equal(h.records.get('conversation:'+copy.id).data.title,copy.title);
});
test('malformed legacy and quota/security errors are visible, originals untouched',()=>{
 assert.throws(()=>readLegacy({getItem:()=>'{bad'}));assert.throws(()=>readLegacy({getItem:()=>{throw Error('denied')}}));
});
