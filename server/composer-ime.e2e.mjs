import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createChatServer} from './local.mjs';
import {chromium} from '/usr/local/lib/hermes-agent/node_modules/playwright-core/index.mjs';

// Exercises the actual production ChatInput through DOM events, without upstream calls.
const config = JSON.parse(readFileSync(new URL('../runtime.json', import.meta.url)));
const live = process.env.TEST_BASE_URL;
const server = live ? null : createChatServer({...config, secureCookie:false, publicPath:'/'}, {
  store:{}, dist:new URL('../'+(process.env.TEST_DIST || 'dist'),import.meta.url).pathname,
  fetch:async()=>{throw new Error('Upstream forbidden in IME regression tests');}
});
if (server) await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base = live || `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({headless:true, executablePath:'/root/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome', args:['--no-sandbox','--disable-dev-shm-usage','--renderer-process-limit=1']});
try {
  async function setup() {
    const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
    await context.addCookies([{name:'chat_session',value:config.accessToken,url:base}]);
    await context.addInitScript(()=>{
      const original=window.fetch.bind(window);
      window.__imeRequests=[]; window.__imeAborts=0; window.__imeHold=false;
      window.fetch=async (url,options)=>{
        if (String(url).includes('api/chat')) {
          window.__imeRequests.push(JSON.parse(options.body));
          const body=new ReadableStream({start(controller){
            controller.enqueue(new TextEncoder().encode('event: text\ndata: {"delta":"mock reply"}\n\n'));
            if (!window.__imeHold) {controller.enqueue(new TextEncoder().encode('event: done\ndata: {}\n\n'));controller.close();}
            else options.signal.addEventListener('abort',()=>{window.__imeAborts++;controller.error(new DOMException('Aborted','AbortError'));});
          }});
          return new Response(body,{headers:{'Content-Type':'text/event-stream'}});
        }
        return original(url,options);
      };
    });
    const page=await context.newPage();
    await page.route('**/api/**',r=>{
      const path=new URL(r.request().url()).pathname;
      if(path.includes('/history')) return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:[],next:null,cursor:'0',more:false})});
      // Fail closed for every other API, especially any unmocked chat call.
      return r.abort();
    });
    await page.goto(base); const input=page.locator('textarea').first(); await input.waitFor();
    await input.fill('中文输入测试');
    return {context,page,input};
  }
  async function event(input,type,options={}) {
    return input.evaluate((el,{type,options})=>{
      const event=type.startsWith('composition') ? new CompositionEvent(type,{bubbles:true,data:'中文',...options}) : new KeyboardEvent(type,{bubbles:true,cancelable:true,key:'Enter',code:'Enter',keyCode:13,...options});
      el.dispatchEvent(event); return event.defaultPrevented;
    },{type,options});
  }
  for (const [name,mode] of [
    ['native isComposing protects Enter','native'],
    ['composition ref protects Enter when native flag is false','ref'],
    ['Safari compositionend before keydown uses keyCode 229','safari'],
    ['standalone keyCode 229 protects Enter','229'],
  ]) await test(name,async()=>{
    const {context,page,input}=await setup();
    try {
      if(mode!=='229') await event(input,'compositionstart');
      if(mode==='safari') await event(input,'compositionend');
      const prevented=await event(input,'keydown',{isComposing:mode==='native',keyCode:['safari','229'].includes(mode)?229:13});
      assert.equal(prevented,false,'IME confirmation must retain its default behavior');
      assert.equal(await input.inputValue(),'中文输入测试','IME confirmation must not clear draft');
      assert.equal(await page.evaluate(()=>window.__imeRequests.length),0,'IME confirmation must not send');
      if(['native','ref'].includes(mode)) await event(input,'compositionend');
      // No cooldown: the very next real Enter sends immediately.
      await input.press('Enter');
      await page.waitForFunction(()=>window.__imeRequests.length===1);
      assert.equal(await page.evaluate(()=>window.__imeRequests[0].messages.at(-1).content),'中文输入测试');
    } finally {await context.close();}
  });
  await test('native isComposing protects without compositionstart',async()=>{
    const {context,page,input}=await setup();
    try {assert.equal(await event(input,'keydown',{isComposing:true}),false);assert.equal(await page.evaluate(()=>window.__imeRequests.length),0);}finally{await context.close();}
  });
  await test('blur clears abandoned composition so next Enter sends',async()=>{
    const {context,page,input}=await setup();
    try {await event(input,'compositionstart');await input.evaluate(el=>{el.focus();el.blur();});await input.press('Enter');await page.waitForFunction(()=>window.__imeRequests.length===1);}finally{await context.close();}
  });
  await test('ordinary Enter sends exactly once',async()=>{
    const {context,page,input}=await setup();
    try {await input.press('Enter'); await page.waitForFunction(()=>window.__imeRequests.length===1);assert.equal(await page.evaluate(()=>window.__imeRequests.length),1);}finally{await context.close();}
  });
  await test('Shift+Enter inserts newline without sending',async()=>{
    const {context,page,input}=await setup();
    try {await input.press('Shift+Enter');assert.equal(await input.inputValue(),'中文输入测试\n');assert.equal(await page.evaluate(()=>window.__imeRequests.length),0);}finally{await context.close();}
  });
  await test('IME Enter cannot stop an active response; ordinary Enter still stops',async()=>{
    const {context,page,input}=await setup();
    try {
      await page.evaluate(()=>window.__imeHold=true); await input.press('Enter');
      await page.getByTitle('Stop response').waitFor();
      const active=page.locator('textarea').first(); await active.fill('继续输入');
      await event(active,'compositionstart');
      assert.equal(await event(active,'keydown',{isComposing:true}),false);
      await event(active,'compositionend');
      assert.equal(await event(active,'keydown',{keyCode:229}),false);
      assert.equal(await page.evaluate(()=>window.__imeAborts),0);
      assert.equal(await page.getByTitle('Stop response').isVisible(),true);
      await active.press('Enter');await page.waitForFunction(()=>window.__imeAborts===1);
      assert.equal(await page.evaluate(()=>window.__imeRequests.length),1);
    }finally{await context.close();}
  });
} finally {
  await browser.close(); if(server) await new Promise(r=>server.close(r));
}
