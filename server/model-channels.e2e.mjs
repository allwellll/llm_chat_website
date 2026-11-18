import assert from 'node:assert/strict';
import {createChatServer} from './local.mjs';
import {chromium} from '/usr/local/lib/hermes-agent/node_modules/playwright-core/index.mjs';
const channels=[{id:'month-end',label:'月末 claude',endpoint:'https://month.invalid',key:'fake-month-secret'},{id:'claudecode-quality',label:'claudecode-quality',endpoint:'https://quality.invalid',key:'fake-quality-secret'}];
const config={accessToken:'model_channel_test_session_1234567890',secureCookie:false,channels,defaultChannel:'month-end'};
const server=createChatServer(config,{store:{},dist:new URL('../dist.channels-staging',import.meta.url).pathname,fetch:async()=>{throw Error('Paid upstream forbidden');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'/root/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage','--renderer-process-limit=1']});
 for(const width of [320,360,390,430,1280]){
  const ctx=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  await ctx.addCookies([{name:'chat_session',value:config.accessToken,url:base}]);const page=await ctx.newPage();page.setDefaultTimeout(2500);const requests=[];
  await page.route('**/api/**',r=>{const path=new URL(r.request().url()).pathname;
   if(path==='/api/channels')return r.continue();
   if(path==='/api/chat'){requests.push(r.request().postDataJSON());return r.fulfill({contentType:'text/event-stream',body:'event: text\ndata: {"delta":"OK"}\n\nevent: done\ndata: {}\n\n'});}
   if(path.startsWith('/api/history')){if(r.request().method()==='PUT'){const b=r.request().postDataJSON();return r.fulfill({json:{record:{kind:'conversation',id:b.data.id,data:b.data,version:b.version+1}}});}return r.fulfill({json:{records:[],next:null,cursor:'0',more:false}});}
   return r.abort();
  });
  try{
   await page.goto(base);const trigger=page.getByRole('button',{name:/选择模型/});await trigger.waitFor();await page.waitForFunction(()=>document.querySelector('[data-model-channel-label]')?.textContent.includes('月末'));
   assert.equal(await page.getByRole('combobox',{name:'上游渠道'}).count(),0);
   await trigger.click();const menu=page.getByRole('menu',{name:'模型与分组'});await menu.waitFor();const quality=page.getByRole('menuitemradio',{name:'Claude Opus 5.5 claudecode-quality'});
   assert.equal(await page.getByRole('menuitemradio',{name:'Claude Opus 5.5 月末 claude'}).getAttribute('aria-checked'),'true');
   const box=await menu.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width,JSON.stringify({width,box}));
   const colors=await quality.evaluate(el=>({model:getComputedStyle(el.querySelector('[data-model-name]')).color,group:getComputedStyle(el.querySelector('[data-group-name]')).color}));assert.notEqual(colors.model,colors.group);
   await quality.click();assert.equal(await menu.count(),0);assert.ok((await trigger.textContent()).includes('claudecode-quality'));
   await page.reload();await page.waitForFunction(()=>document.querySelector('[data-model-channel-label]')?.textContent.includes('claudecode-quality'));
   await trigger.click();await page.keyboard.press('Escape');assert.equal(await menu.count(),0);
   await trigger.click();await page.mouse.click(width-4,4);assert.equal(await menu.count(),0);
   const input=page.locator('textarea').first();await input.fill('mock test');const response=page.waitForResponse(r=>r.url().endsWith('/api/chat'));await input.press('Enter');await response;assert.equal(requests.at(-1).channel,'claudecode-quality');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   console.log(`PASS ${width}px: integrated model menu, muted group, routing, persistence, dismiss and no overflow`);
   if(width===390){await page.getByRole('button',{name:/选择模型/}).click();await page.screenshot({path:'/tmp/claude-model-groups.png'});}
  }finally{await ctx.close();}
 }
}finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
