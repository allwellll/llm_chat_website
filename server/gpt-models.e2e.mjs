import assert from 'node:assert/strict';
import {createChatServer} from './local.mjs';
import {chromium} from '/usr/local/lib/hermes-agent/node_modules/playwright-core/index.mjs';

// Build first: npx tsc && npx vite build --outDir /tmp/claude-gpt-ui-test
// No runtime.json, real credentials, database, or paid upstream are used.
const metadata={defaultChannel:'month-end',channels:[{id:'month-end',label:'月末 claude'},{id:'quality',label:'claudecode-quality'},{id:'cheap-6-1-sol',label:'cheap_6_1_sol',protocol:'responses',models:['gpt-6-astra','gpt-6.1-sol']}]};
const config={accessToken:'gpt_model_test_session_1234567890',secureCookie:false,channels:[{id:'month-end',label:'月末 claude',endpoint:'https://never.invalid',key:'fake'}],defaultChannel:'month-end'};
const forbidden=[];
const server=createChatServer(config,{dist:process.env.TEST_DIST||'/tmp/claude-gpt-ui-test',store:new Proxy({},{get:(_,key)=>()=>{forbidden.push(String(key));throw Error('Live history forbidden');}}),fetch:async()=>{forbidden.push('upstream');throw Error('Paid upstream forbidden');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/`;
let browser;
try {
 browser=await chromium.launch({headless:true,executablePath:'/root/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage','--renderer-process-limit=1']});
 for(const width of [320,390,1280]) {
  const ctx=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  await ctx.addCookies([{name:'chat_session',value:config.accessToken,url:base}]);
  await ctx.addInitScript(()=>{if(window===window.top)localStorage.setItem('claude_pg_migrated_v1','1');});
  const page=await ctx.newPage();page.setDefaultTimeout(3500);const requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));let unavailable=false;
  const saved={id:'saved-gpt',title:'保存的 GPT 会话',model:'gpt-6.1-sol',createdAt:1,updatedAt:1,messages:[{id:'saved-msg',role:'user',content:'已保存正文',createdAt:1}]};
  await page.route('**/api/**',async r=>{
   const path=new URL(r.request().url()).pathname,method=r.request().method();
   if(path==='/api/channels')return r.fulfill({json:unavailable?{...metadata,channels:metadata.channels.slice(0,2)}:metadata});
   if(path==='/api/chat'){requests.push(r.request().postDataJSON());return r.fulfill({contentType:'text/event-stream',body:'event: text\ndata: {"delta":"OK"}\n\nevent: done\ndata: {}\n\n'});}
   if(path==='/api/history/conversation/saved-gpt'&&method==='GET'){await new Promise(resolve=>setTimeout(resolve,100));return r.fulfill({json:{record:{kind:'conversation',id:saved.id,version:1,data:saved}}});}
   if(path.startsWith('/api/history')){
    if(method==='PUT'){const b=r.request().postDataJSON();return r.fulfill({json:{record:{kind:'conversation',id:b.data.id,data:b.data,version:b.version+1}}});}
    if(method==='GET')return r.fulfill({json:{records:[],next:null,cursor:'0',more:false}});
   }
   return r.abort();
  });
  const trigger=page.getByRole('button',{name:/选择模型/});
  const choose=async name=>{await trigger.click();await page.getByRole('menuitemradio',{name,exact:true}).click();};
  const send=async()=>{const input=page.locator('textarea').first();await input.fill('mock request');const response=page.waitForResponse(r=>r.url().endsWith('/api/chat'));await input.press('Enter');await response;await page.getByRole('button',{name:'停止生成',exact:true}).waitFor({state:'hidden'});};
  try {
   await page.goto(base);await trigger.waitFor();await page.waitForFunction(()=>document.querySelector('[data-model-channel-label]')?.textContent==='月末 claude');
   await trigger.click();assert.equal(await page.getByRole('menuitemradio').count(),4,'two Claude groups plus two GPT models');
   const box=await page.getByRole('menu').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);
   await page.getByRole('menuitemradio',{name:'gpt-6-astra cheap_6_1_sol',exact:true}).click();assert.match(await trigger.getAttribute('aria-label'),/gpt-6-astra/);
   await send();assert.equal(requests.at(-1).profile,'gpt-6-astra');assert.equal(requests.at(-1).channel,'cheap-6-1-sol');
   await choose('gpt-6.1-sol cheap_6_1_sol');await send();assert.equal(requests.at(-1).profile,'gpt-6.1-sol');
   await page.goto(base);await page.waitForFunction(()=>document.querySelector('[aria-label^="选择模型"]')?.textContent.includes('gpt-6.1-sol'));
   await choose('Claude Opus 5.5 claudecode-quality');await send();assert.equal(requests.at(-1).profile,'opus-5');assert.equal(requests.at(-1).channel,'quality');
   await page.goto(base);await page.waitForFunction(()=>document.querySelector('[data-model-channel-label]')?.textContent==='claudecode-quality');
   await choose('gpt-6-astra cheap_6_1_sol');await page.goto(base+'saved-gpt');await page.getByText('已保存正文',{exact:true}).waitFor();assert.match(await trigger.getAttribute('aria-label'),/gpt-6.1-sol/);await send();assert.equal(requests.at(-1).profile,'gpt-6.1-sol');assert.equal(requests.at(-1).channel,'cheap-6-1-sol');
   // Missing compatibility metadata must fail closed: never send a GPT profile to Claude.
   unavailable=true;await page.goto(base);await trigger.waitFor();await page.waitForFunction(()=>document.querySelector('[data-model-channel-label]')?.textContent==='无可用分组');const before=requests.length;const blockedInput=page.locator('textarea').first();await blockedInput.fill('blocked request');await blockedInput.press('Enter');await page.getByText('所选模型没有可用的兼容分组，请选择其他模型或重试',{exact:false}).first().waitFor();assert.equal(requests.length,before,'unavailable GPT channel must block request');
   await choose('Claude Opus 5.5 claudecode-quality');await send();assert.equal(requests.at(-1).channel,'quality');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
   // Untrusted persisted IDs fall back to Claude, and storage exceptions never break selection.
   await page.evaluate(()=>{localStorage.setItem('chat_model_v1','not-a-model');localStorage.setItem('claude_channel_v1','cheap-6-1-sol');});
   await page.goto(base);await page.waitForFunction(()=>document.querySelector('[aria-label^="选择模型"]')?.getAttribute('aria-label')==='选择模型：Claude Opus 5.5，月末 claude');
   unavailable=false;await page.goto(base);await trigger.waitFor();await choose('gpt-6-astra cheap_6_1_sol');await send();assert.equal(requests.at(-1).profile,'gpt-6-astra');assert.equal(requests.at(-1).channel,'cheap-6-1-sol');assert.deepEqual(errors,[]);
   console.log(`PASS ${width}px: GPT entries, exact profiles, compatible channels, persistence, lazy conversation model restore, fail-closed, Claude retained, no overflow`);
  } finally {await ctx.close();}
 }
 assert.deepEqual(forbidden,[]);
} finally {if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
