import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PostgresHistoryStore} from './history-store.mjs';
import {createChatServer} from './local.mjs';
import {HistorySync} from '../src/services/historySync.mjs';
const conv=id=>({id,title:id,model:'opus-5',createdAt:1,updatedAt:1,messages:[{id:'m',role:'user',content:'HEAVY_BODY',attachments:[{id:'f',name:'secret',textContent:'PRIVATE_ATTACHMENT'}],createdAt:1}]});
async function fixture(t){const config=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));const schema=`history_test_lazy_more_${process.pid}_${Math.random().toString(36).slice(2,9)}`;const store=new PostgresHistoryStore(config.database,{schema});await store.ready();t.after(async()=>{await store.pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await store.close();});return {config,store};}
test('all kinds list/change payloads exclude bodies; HTTP validation, auth, read origin',async t=>{
 const {store,config}=await fixture(t);await store.write('conversation','c',0,conv('c'));await store.write('project','p',0,{id:'p',name:'project',description:'PRIVATE_DESCRIPTION',customInstructions:'PRIVATE_INSTRUCTIONS',files:[{textContent:'PRIVATE_FILE'}],createdAt:1,updatedAt:1});await store.write('artifact','a',0,{id:'a',title:'artifact',content:'PRIVATE_ARTIFACT',identifier:'a',type:'text/html',createdAt:1});
 for(const payload of [await store.page(),await store.changes()])assert.doesNotMatch(JSON.stringify(payload),/HEAVY_BODY|PRIVATE_|messages|attachments|customInstructions|files|"content"/);
 const server=createChatServer({...config,secureCookie:false,publicPath:'/'},{store});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}`;const headers={cookie:`chat_session=${config.accessToken}`};
 assert.equal((await fetch(base+'/api/history/conversation/c')).status,404);
 assert.equal((await fetch(base+'/api/history?limit=101',{headers})).status,400);assert.equal((await fetch(base+'/api/history?cursor=garbage',{headers})).status,400);assert.equal((await fetch(base+'/api/history/changes?cursor=-1',{headers})).status,400);
 for(const path of ['/api/history','/api/history/changes','/api/history/conversation/c'])assert.equal((await fetch(base+path,{headers:{...headers,origin:'https://evil.invalid'}})).status,403);
 assert.equal((await fetch(base+'/api/history/conversation/missing',{headers})).status,404);assert.equal((await fetch(base+'/api/history/conversation/bad%21',{headers})).status,404);
 assert.equal((await(await fetch(base+'/api/history/conversation/c',{headers})).json()).record.data.messages[0].content,'HEAVY_BODY');
});
test('commit-ordered incremental cursor cannot miss blocked transaction; rollback safe',async t=>{
 const {store}=await fixture(t);await store.write('conversation','a',0,conv('a'));await store.write('conversation','b',0,conv('b'));const base=(await store.page()).cursor;const client=await store.pool.connect();
 try{await client.query('BEGIN');await client.query(`UPDATE ${store.table} SET version=version+1 WHERE id='a'`);const pending=store.write('conversation','b',1,{...conv('b'),title:'changed'});assert.equal((await store.changes({cursor:base})).records.length,0);await client.query('COMMIT');await pending;const first=await store.changes({cursor:base,limit:1});const second=await store.changes({cursor:first.cursor,limit:1});assert.equal(first.records[0].id,'a');assert.equal(second.records[0].id,'b');
 await client.query('BEGIN');await client.query(`UPDATE ${store.table} SET version=version+1 WHERE id='a'`);await client.query('ROLLBACK');assert.equal((await store.changes({cursor:second.cursor})).records.length,0);
 }finally{await client.query('ROLLBACK');client.release();}
});
test('pagination omissions are not deletions; loaded dirty edits survive remote changes; explicit clear covers unseen pages',async()=>{
 const records=Array.from({length:35},(_,i)=>({kind:'conversation',id:'c'+i,version:1,deleted:false,summary:true,data:{id:'c'+i,title:'c'+i,model:'opus-5',createdAt:1,updatedAt:1}}));const writes=[];const sync=new HistorySync({storage:{getItem:()=> '1'},request:async(path,opt)=>{
 if(opt){writes.push({path,...JSON.parse(opt.body)});return {record:{kind:'conversation',id:path.split('/').at(-1),version:2,deleted:opt.method==='DELETE',data:JSON.parse(opt.body).data}};}
 if(path.includes('/changes'))return {records:[],cursor:'35'};
 if(path.includes('/conversation/'))return {record:{...records[0],summary:false,data:conv(path.split('/').at(-1))}};
 return path.includes('kind=conversation')?{records,next:null,cursor:'35'}:{records:records.slice(0,30),next:'next',cursor:'35'};
 }});await sync.start();assert.equal(sync.snapshot().conversations.length,30);await sync.refresh();assert.equal(writes.length,0);await sync.load('conversation','c0');const snap=sync.snapshot();snap.conversations=snap.conversations.map(c=>c.id==='c0'?{...c,title:'dirty'}:c);sync.update(snap);sync.merge([{...records[0],version:2,data:{...records[0].data,title:'remote'}}]);assert.equal(sync.snapshot().conversations.find(c=>c.id==='c0').title,'dirty');await sync.clearConversations();assert.equal(writes.length,35);assert.ok(writes.every(w=>!w.data));
});
