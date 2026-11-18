import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatServer, MODEL } from './local.mjs';
const accessToken = 'channels_test_session_1234567890123456';
const channels = [
  {id:'month-end',label:'月末 claude',endpoint:'https://month.invalid/v1',key:'test-month-private'},
  {id:'claudecode-quality',label:'claudecode-quality',endpoint:'https://quality.invalid',key:'test-quality-private'}
];
const config = {accessToken,secureCookie:false,channels,defaultChannel:'month-end'};
const headers = {cookie:`chat_session=${accessToken}`,'content-type':'application/json'};
async function fixture(t, cfg=config) {
  const calls=[];
  const server=createChatServer(cfg,{store:{},fetch:async(url,options)=>{calls.push({url,...options});return Response.json({content:[{type:'text',text:'mock'}]});}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
  return {calls,base:`http://127.0.0.1:${server.address().port}`};
}
const chat=(base,extra={})=>fetch(base+'/api/chat',{method:'POST',headers,body:JSON.stringify({messages:[{role:'user',content:'hello'}],...extra})});
test('metadata requires authentication and returns only public channel data',async t=>{
  const {base,calls}=await fixture(t);
  assert.equal((await fetch(base+'/api/channels')).status,404);
  const res=await fetch(base+'/api/channels',{headers});
  assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');
  assert.deepEqual(await res.json(),{channels:channels.map(({id,label})=>({id,label})),defaultChannel:'month-end'});
  assert.equal(calls.length,0);
});
test('omitted channel uses default; explicit channel selects only server credentials',async t=>{
  const {base,calls}=await fixture(t);
  for(const extra of [{},{channel:'claudecode-quality',endpoint:'https://evil.invalid',key:'evil'},{channel:'month-end',webSearch:true}]) {
    const res=await chat(base,extra); assert.equal(res.status,200);const text=await res.text();
    for(const c of channels) {assert.ok(!text.includes(c.key));assert.ok(!text.includes(c.endpoint));}
  }
  assert.deepEqual(calls.map(c=>c.url),['https://month.invalid/v1/messages','https://quality.invalid/v1/messages','https://month.invalid/v1/messages']);
  assert.deepEqual(calls.map(c=>c.headers['x-api-key']),[channels[0].key,channels[1].key,channels[0].key]);
  for(const c of calls) {assert.equal(c.headers.Authorization,`Bearer ${c.headers['x-api-key']}`);const p=JSON.parse(c.body);assert.equal(p.model,MODEL);assert.equal(p.channel,undefined);}
  assert.equal(JSON.parse(calls[0].body).tools,undefined);assert.equal(JSON.parse(calls[2].body).tools[0].name,'web_search');
});
test('invalid channel IDs and types rejected before upstream without leaks',async t=>{
  const {base,calls}=await fixture(t);
  for(const channel of ['unknown','__proto__','constructor','https://evil.invalid','',null,1,{},['month-end']]) {
    const res=await chat(base,{channel});assert.equal(res.status,400);assert.deepEqual(await res.json(),{error:'Invalid channel'});
  }
  assert.equal(calls.length,0);
});
test('legacy endpoint/key config exposes only quality fallback and still sends',async t=>{
  const {base,calls}=await fixture(t,{accessToken,secureCookie:false,endpoint:channels[1].endpoint,key:channels[1].key});
  assert.deepEqual(await (await fetch(base+'/api/channels',{headers})).json(),{channels:[{id:'claudecode-quality',label:'claudecode-quality'}],defaultChannel:'claudecode-quality'});
  const res=await chat(base);assert.equal(res.status,200);await res.text();assert.equal(calls[0].headers['x-api-key'],channels[1].key);
});
test('malformed channel configuration fails closed with generic errors',()=>{
  for(const override of [
    {channels:[]},{channels:null},{channels:{}},{defaultChannel:'missing'},
    {channels:[channels[0],channels[0]]},{channels:[{...channels[0],id:'bad/id'}]},
    {channels:[{...channels[0],key:'secret\ninvalid'}]}, {channels:[{...channels[0],key:''}]},
    {channels:[{...channels[0],label:''}]},{channels:[{...channels[0],endpoint:'file:///secret'}]}
  ]) assert.throws(()=>createChatServer({...config,...override}),/Invalid channel configuration/);
});
test('channels default to month-end when available, otherwise first configured channel',async t=>{
  for(const list of [[channels[1],channels[0]],[channels[1]]]) {
    const {base}=await fixture(t,{accessToken,secureCookie:false,channels:list});
    assert.equal((await (await fetch(base+'/api/channels',{headers})).json()).defaultChannel,list.length===2?'month-end':'claudecode-quality');
  }
});
