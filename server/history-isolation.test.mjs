import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {HistorySync} from '../src/services/historySync.mjs';
const conv=id=>({id,title:id,model:'opus-5',createdAt:1,updatedAt:1,messages:[]});
test('one rejected history must not block independent saves and deletions',async()=>{
 const calls=[];const sync=new HistorySync({request:async(path,opts)=>{calls.push(path);if(path.endsWith('/bad'))throw Error('record exceeds limit');const body=JSON.parse(opts.body);return {record:{kind:'conversation',id:path.split('/').pop(),version:body.version+1,deleted:opts.method==='DELETE',data:body.data||null}};}});
 sync.ready=true;sync.update({conversations:[conv('bad'),conv('good')],projects:[],artifacts:[]});await sync.flush();
 assert.ok(calls.includes('/api/history/conversation/good'));assert.equal(sync.dirty.size,1);assert.ok(sync.error);assert.ok(sync.dirty.has('conversation:bad'));
});
test('React snapshot capture is a synchronous layout effect, before async refresh can interleave with committed UI',async()=>{
 const source=await readFile(new URL('../src/context/ChatContext.tsx',import.meta.url),'utf8');
 assert.match(source,/useLayoutEffect\(\(\) => \{\s*sync\.update\(/);
});
