import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PostgresHistoryStore} from './history-store.mjs';
import {HistorySync} from '../src/services/historySync.mjs';
const conv=id=>({id,title:id,model:'opus-5',createdAt:1,updatedAt:1,messages:[{id:'m',role:'user',content:'HEAVY_PRIVATE_BODY',createdAt:1}]});
test('lazy PostgreSQL pages, compact ordered changes, detail and CAS preserve body',async t=>{
 const runtime=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));const schema=`history_test_lazy_${process.pid}`;const s=new PostgresHistoryStore(runtime.database,{schema});t.after(async()=>{await s.pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await s.close();});
 await Promise.all(Array.from({length:35},(_,i)=>s.write('conversation',`c${String(i).padStart(2,'0')}`,0,conv(`c${String(i).padStart(2,'0')}`))));
 const first=await s.page({limit:30});assert.equal(first.records.length,30);assert.ok(first.next);assert.doesNotMatch(JSON.stringify(first),/HEAVY_PRIVATE_BODY|messages/);
 const second=await s.page({limit:30,cursor:first.next});assert.equal(second.records.length,5);assert.equal(new Set([...first.records,...second.records].map(r=>r.id)).size,35);
 const before=first.cursor;await Promise.all(['c00','c01'].map(id=>s.write('conversation',id,1,{...conv(id),title:'renamed'})));
 const changes=await s.changes({cursor:before,limit:1});assert.equal(changes.records.length,1);assert.ok(changes.more);const tail=await s.changes({cursor:changes.cursor,limit:30});assert.equal(tail.records.length,1);assert.doesNotMatch(JSON.stringify(tail),/HEAVY_PRIVATE_BODY|messages/);
 assert.equal((await s.detail('conversation','c00')).data.messages[0].content,'HEAVY_PRIVATE_BODY');assert.equal((await s.page({q:'renamed'})).records.length,2);
 await assert.rejects(()=>s.page({limit:10000}));await assert.rejects(()=>s.changes({cursor:'bad'}));
});
test('lazy sync boot only first page; metadata edit loads full body; absent pages never deleted',async()=>{
 const calls=[];let saved;const record={kind:'conversation',id:'one',version:1,deleted:false,data:conv('one')};const storage={getItem:()=> '1',setItem(){}};
 const sync=new HistorySync({storage,request:async(path,opt)=>{calls.push(path);if(opt){saved=JSON.parse(opt.body).data;return {record:{...record,data:saved,version:2}};}if(path.includes('/conversation/'))return {record};if(path.includes('/changes'))return {records:[],cursor:'1',more:false};return {records:[{...record,data:{id:'one',title:'one',model:'opus-5',createdAt:1,updatedAt:1},summary:true}],next:'next-page',cursor:'1'};}});
 await sync.start();assert.equal(calls.length,1);assert.ok(sync.snapshot().conversations[0]._historyUnloaded);
 sync.update({conversations:[{...sync.snapshot().conversations[0],title:'renamed'}],projects:[],artifacts:[]});await sync.flush();assert.equal(saved.messages[0].content,'HEAVY_PRIVATE_BODY');assert.equal(saved.title,'renamed');assert.equal(calls.filter(p=>p==='/api/history').length,0);
});
