import test from 'node:test';
import assert from 'node:assert/strict';
import {chatPayload} from './local.mjs';
const body={systemPrompt:'保留原有自定义指令。',messages:[{role:'user',content:'现在几点？'}]};
test('system retains custom instructions and appends Beijing date, time, weekday and timezone',()=>{
 const p=chatPayload(body,{},new Date('2026-10-17T02:21:43Z'));
 assert.ok(p.system.startsWith(body.systemPrompt+'\n\n'));
 assert.match(p.system,/2026-10-17 10:21:43/);
 assert.match(p.system,/星期六/);
 assert.match(p.system,/Asia\/Shanghai.*UTC\+08:00/);
 assert.match(p.system,/请求发起时/);
});
test('time context is regenerated per request and handles Beijing midnight',()=>{
 const before=chatPayload(body,{},new Date('2026-10-17T15:59:59Z')).system;
 const after=chatPayload(body,{},new Date('2026-10-17T16:00:00Z')).system;
 assert.match(before,/2026-10-17 23:59:59.*星期六/);
 assert.match(after,/2026-10-18 00:00:00.*星期日/);
 assert.notEqual(before,after);
});
test('empty system prompt still receives server-generated time, without changing messages',()=>{
 const input={messages:body.messages,currentTime:'spoofed'};
 const p=chatPayload(input,{},new Date('2026-10-17T02:21:43Z'));
 assert.match(p.system,/2026-10-17 10:21:43/);
 assert.ok(!p.system.includes('spoofed'));
 assert.equal(p.messages[0].content[0].text,'现在几点？');
});
