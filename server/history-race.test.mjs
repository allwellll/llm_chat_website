import test from 'node:test';
import assert from 'node:assert/strict';
import { HistorySync } from '../src/services/historySync.mjs';
const c=title=>({id:'one',title,messages:[],createdAt:1,updatedAt:1,model:'opus-5'});
test('active streamed records cannot be refreshed and persisted snapshots are never marked still streaming',async()=>{
 let version=1;let saved;
 const s=new HistorySync({storage:storage(),request:async(path,opts)=>{
  if(opts){saved=JSON.parse(opts.body).data;return {record:{...record(++version,'partial'),data:saved}};}
  return {records:[record(version,'remote')]};
 }});
 await s.start();s.update({conversations:[{...c('partial'),messages:[{id:'m',role:'assistant',content:'partial',isStreaming:true,isThinking:true,createdAt:1}]}],projects:[],artifacts:[]});await s.flush();
 assert.equal(saved.messages[0].isStreaming,false);version=9;await s.refresh();assert.equal(s.snapshot().conversations[0].title,'partial');
});
const snapshot=title=>({conversations:[c(title)],projects:[],artifacts:[]});
const record=(version,title)=>({kind:'conversation',id:'one',version,deleted:false,data:c(title)});
function storage(){return {getItem:()=> '1',setItem:()=>{}};}
test('slow pre-save refresh cannot roll back an acknowledged newer edit',async()=>{
 let version=1;let title='old';let held;let delay=false;
 const s=new HistorySync({storage:storage(),request:async(path,opts)=>{
  if(opts){version++;title=JSON.parse(opts.body).data.title;return {record:record(version,title)};}
  const response={records:[record(version,title)]};
  if(delay)return new Promise(r=>held=()=>r(response));return response;
 }});
 await s.start();delay=true;const refresh=s.refresh();s.update(snapshot('new'));await s.flush();held();await refresh;
 assert.equal(s.snapshot().conversations[0].title,'new');
});
test('edits during in-flight upload use the acknowledged CAS revision',async()=>{
 let held;let count=0;const versions=[];
 const s=new HistorySync({storage:storage(),request:async(path,opts)=>{
  if(!opts)return {records:[record(1,'old')]};
  const body=JSON.parse(opts.body);versions.push(body.version);count++;
  if(count===1)await new Promise(r=>held=r);
  return {record:record(body.version+1,body.data.title)};
 }});
 await s.start();s.update(snapshot('first'));const uploading=s.flush();s.update(snapshot('last'));held();await uploading;
 assert.deepEqual(versions,[1,2]);assert.equal(s.snapshot().conversations[0].title,'last');assert.equal(s.dirty.size,0);
});
