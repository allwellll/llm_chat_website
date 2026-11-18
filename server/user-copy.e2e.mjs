import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createChatServer} from './local.mjs';
import {chromium} from '/usr/local/lib/hermes-agent/node_modules/playwright-core/index.mjs';

// Real built UI; all API traffic isolated, no upstream or live history mutations.
const config=JSON.parse(readFileSync(new URL('../runtime.json',import.meta.url)));
const live=process.env.TEST_BASE_URL;
const server=live?null:createChatServer({...config,secureCookie:false,publicPath:'/'},{store:{},dist:new URL('../'+(process.env.TEST_DIST||'dist'),import.meta.url).pathname,fetch:async()=>{throw Error('Paid upstream forbidden');}});
if(server)await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=live||`http://127.0.0.1:${server.address().port}/`;
const raw='  中文 query 👋 **原文**\n\n```js\nconst x = "<tag>";\n```\n末行\t  ';
const reply='assistant **原始回复**\n下一行';
const browser=await chromium.launch({headless:true,executablePath:'/root/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage','--renderer-process-limit=1']});
async function setup(mode='ok',mobile=false){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},serviceWorkers:'block'});
 await context.addCookies([{name:'chat_session',value:config.accessToken,url:base}]);
 await context.addInitScript(({mode})=>{
  if(window!==window.top)return;
  localStorage.setItem('claude_pg_migrated_v1','1');
  window.__copies=[];window.__chatRequests=[];window.__copyMode=mode;
  const clipboard={writeText:async text=>{
   window.__copies.push(text);
   if(window.__copyMode==='reject')throw new DOMException('Denied','NotAllowedError');
   if(window.__copyMode==='pending')await new Promise(resolve=>window.__finishCopy=resolve);
  }};
  if(mode!=='real')Object.defineProperty(navigator,'clipboard',{configurable:true,value:mode==='missing'?undefined:clipboard});
  const original=window.fetch.bind(window);
  window.fetch=async(url,options)=>{
   if(String(url).includes('api/chat')){
    window.__chatRequests.push(JSON.parse(options.body));
    return new Response('event: text\ndata: {"delta":"mock reply"}\n\nevent: done\ndata: {}\n\n',{headers:{'Content-Type':'text/event-stream'}});
   }
   return original(url,options);
  };
 },{mode});
 const page=await context.newPage();page.setDefaultTimeout(5000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let data={id:'copy-fixture',title:'Copy fixture',model:'opus-5',createdAt:1,updatedAt:1,messages:[{id:'copy-user',role:'user',content:raw,createdAt:1,attachments:[{id:'attachment',name:'attachment-not-query.txt',type:'text/plain',size:5,textContent:'not-query'}]},{id:'copy-assistant',role:'assistant',content:reply,createdAt:1}]};
 const record=()=>({kind:'conversation',id:data.id,version:1,data});
 await page.route('**/api/**',route=>{
  const request=route.request();const path=new URL(request.url()).pathname;
  if(!path.includes('/api/history'))return route.abort();
  if(request.method()==='PUT'){data=JSON.parse(request.postData()).data;return route.fulfill({json:{record:record()}});}
  if(path.endsWith('/conversation/copy-fixture'))return route.fulfill({json:{record:record()}});
  return route.fulfill({json:{records:path.includes('/changes')?[]:[record()],next:null,cursor:'0',more:false}});
 });
 await page.goto(base+'copy-fixture');await page.getByTitle('Edit message',{exact:true}).waitFor({state:'attached'});
 const edit=page.getByTitle('Edit message',{exact:true});
 const bubble=edit.locator('..');
 const copy=bubble.getByTitle('Copy message',{exact:true});
 return {context,page,edit,bubble,copy,errors};
}
async function fixture(mode,fn,mobile=false){const f=await setup(mode,mobile);try{await fn(f);assert.deepEqual(f.errors,[],'no uncaught browser errors');}finally{await f.context.close();}}
try{
 await test('user hover toolbar copies exact raw query, excludes attachment, shows matching success and resets',()=>fixture('ok',async({page,bubble,copy,edit})=>{
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('[title="Edit message"]').parentElement).opacity==='0');
  await bubble.hover();assert.equal(await copy.count(),1,'user toolbar must contain Copy message next to Edit message');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('[title="Edit message"]').parentElement).opacity==='1');
  assert.equal(await edit.isVisible(),true);await copy.click();
  assert.deepEqual(await page.evaluate(()=>window.__copies),[raw]);await copy.locator('svg.lucide-check').waitFor();
  assert.equal(await page.evaluate(()=>window.__chatRequests.length),0);await copy.locator('svg.lucide-copy').waitFor();
 }));
 await test('copy does not claim success until clipboard resolves',()=>fixture('pending',async({page,bubble,copy})=>{
  await bubble.hover();await copy.click();assert.equal(await copy.locator('svg.lucide-check').count(),0);
  await page.evaluate(()=>window.__finishCopy());await copy.locator('svg.lucide-check').waitFor();
 }));
 await test('clipboard rejection does not show success or throw',()=>fixture('reject',async({page,bubble,copy})=>{
  await bubble.hover();await copy.click();await page.waitForFunction(()=>window.__copies.length===1);
  assert.equal(await copy.locator('svg.lucide-check').count(),0);assert.equal(await copy.locator('svg.lucide-copy').count(),1);
 }));
 await test('unavailable clipboard does not show success or throw',()=>fixture('missing',async({bubble,copy})=>{
  await bubble.hover();await copy.click();assert.equal(await copy.locator('svg.lucide-check').count(),0);
 }));
 await test('failed retry clears previous copy success',()=>fixture('ok',async({page,bubble,copy})=>{
  await bubble.hover();await copy.click();await copy.locator('svg.lucide-check').waitFor();
  await page.evaluate(()=>window.__copyMode='reject');await copy.click();await copy.locator('svg.lucide-copy').waitFor();
 }));
 await test('existing edit cancel/save preserved; copy uses newly submitted content',()=>fixture('ok',async({page,bubble,edit})=>{
  await bubble.hover();await edit.click();const form=page.locator('form').filter({has:page.getByRole('button',{name:'Save & Submit',exact:true})});
  assert.equal(await form.locator('textarea').inputValue(),raw);await form.locator('textarea').fill('取消修改');await form.getByRole('button',{name:'Cancel',exact:true}).click();
  await bubble.hover();await edit.click();await form.locator('textarea').fill('编辑后的 query\n第二行');await form.getByRole('button',{name:'Save & Submit',exact:true}).click();
  await page.waitForFunction(()=>window.__chatRequests.length===1);await edit.waitFor({state:'attached'});await bubble.hover();const copy=bubble.getByTitle('Copy message',{exact:true});await copy.click();
  assert.deepEqual(await page.evaluate(()=>window.__copies),['编辑后的 query\n第二行']);
 }));
 await test('assistant copy retains original markdown and success icon',()=>fixture('ok',async({page})=>{
  const copy=page.getByTitle('Copy message',{exact:true}).last();await copy.click();await copy.locator('svg.lucide-check').waitFor();assert.deepEqual(await page.evaluate(()=>window.__copies),[reply]);
 }));
 await test('real browser clipboard receives the exact user query; keyboard focus exposes actions',()=>fixture('real',async({context,page,copy})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await copy.focus();await page.waitForFunction(()=>getComputedStyle(document.querySelector('[title="Edit message"]').parentElement).opacity==='1');
  await copy.press('Enter');await copy.locator('svg.lucide-check').waitFor();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),raw);
  if(process.env.TEST_SCREENSHOT)await page.screenshot({path:process.env.TEST_SCREENSHOT});
 }));
 await test('narrow viewport copy remains clickable and edit retained',()=>fixture('ok',async({page,bubble,copy,edit})=>{
  await bubble.hover();await copy.click();assert.deepEqual(await page.evaluate(()=>window.__copies),[raw]);assert.equal(await edit.isVisible(),true);
 },true));
}finally{await browser.close();if(server)await new Promise(r=>server.close(r));}
