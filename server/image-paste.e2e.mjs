import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createChatServer} from './local.mjs';
import {chromium} from '/usr/local/lib/hermes-agent/node_modules/playwright-core/index.mjs';
const live=process.env.TEST_LIVE==='1';
const config=live?JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8')):{accessToken:'paste_test_session_123456789012345678',secureCookie:false,endpoint:'https://fake.invalid',key:'test-secret'};
let server;let base='https://xiaohetongxue.top/claude/';
if(!live){server=createChatServer(config,{store:{},dist:new URL('../dist.channels-staging',import.meta.url).pathname,fetch:async()=>{throw Error('Paid request forbidden');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}/`;}
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'/root/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage','--renderer-process-limit=1',...(live?['--host-resolver-rules=MAP xiaohetongxue.top 127.0.0.1']:[])]});
 for(const width of [390,1280]){
 const ctx=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
 await ctx.addCookies([live?{name:'chat_session',value:config.accessToken,domain:'xiaohetongxue.top',path:'/claude/',secure:true,httpOnly:true}:{name:'chat_session',value:config.accessToken,url:base}]);
 const page=await ctx.newPage();const requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>{const path=new URL(r.request().url()).pathname;
 if(path.endsWith('/api/channels'))return r.continue();
 if(path.endsWith('/api/chat')){requests.push(r.request().postDataJSON());return r.fulfill({contentType:'text/event-stream',body:'event: text\ndata: {"delta":"mock OK"}\n\nevent: done\ndata: {}\n\n'});}
 if(path.includes('/api/history')){if(r.request().method()==='PUT'){const b=r.request().postDataJSON();return r.fulfill({json:{record:{kind:'conversation',id:b.data.id,data:b.data,version:b.version+1}}});}return r.fulfill({json:{records:[],next:null,cursor:'0',more:false}});}
 return r.abort();});
 try{
 await page.goto(base);const input=page.locator('textarea').first();await input.fill('保留文字');
 const paste=async({names=['clip.png'],text='',filesOnly=false,type='image/png'}={})=>input.evaluate((el,{names,text,filesOnly,type,png})=>{
  const d=new DataTransfer();for(const name of names)d.items.add(new File([Uint8Array.from(atob(png),c=>c.charCodeAt(0))],name,{type}));if(text)d.setData('text/plain',text);
  const e=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d});
  if(filesOnly)Object.defineProperty(e,'clipboardData',{value:{items:[],files:d.files,getData:t=>d.getData(t)}});
  el.dispatchEvent(e);return e.defaultPrevented;
 },{names,text,filesOnly,type,png});
 assert.equal(await paste(),true);
 await page.waitForFunction(()=>document.querySelectorAll('img[alt="clip.png"]').length===1);
 assert.equal(await input.inputValue(),'保留文字');assert.equal(await input.inputValue(),'保留文字');
 // Mixed image+text must retain normal browser text-paste behavior.
 assert.equal(await paste({names:['mixed.png'],text:'clipboard text'}),false);
 await page.waitForFunction(()=>!!document.querySelector('img[alt="mixed.png"]'));
 assert.equal(await paste({names:['one.png','two.png']}),true);
 await page.waitForFunction(()=>!!document.querySelector('img[alt="two.png"]'));
 assert.equal(await paste({names:['fallback.png'],filesOnly:true}),true);
 await page.waitForFunction(()=>!!document.querySelector('img[alt="fallback.png"]'));
 assert.equal(await paste({names:[],text:'普通文字'}),false);
 assert.equal(await paste({names:['unsupported.svg'],type:'image/svg+xml'}),false);
 const previews=page.locator('img[alt="one.png"]').locator('..');await previews.getByRole('button').click();assert.equal(await page.locator('img[alt="one.png"]').count(),0);
 await page.locator('input[type=file]').setInputFiles({name:'upload.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.waitForFunction(()=>!!document.querySelector('img[alt="upload.png"]'));
 const sent=page.waitForResponse(r=>r.url().endsWith('/api/chat'));await input.press('Enter');await sent;
 const msg=requests.at(-1).messages.at(-1);assert.equal(msg.content,'保留文字');assert.deepEqual(msg.attachments.map(a=>a.name),['clip.png','mixed.png','two.png','fallback.png','upload.png']);for(const a of msg.attachments){assert.equal(a.type,'image/png');assert.equal(a.dataUrl,'data:image/png;base64,'+png);}
 await page.waitForFunction(()=>document.querySelector('textarea')?.value==='');
 assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));console.log(`PASS ${live?'LIVE HTTPS':'STAGED'} ${width}px: image paste, mixed/plain text default, multiple images, files fallback, remove, upload, outgoing bytes, no live writes/paid API`);
 }finally{await ctx.close();}
 }
}finally{if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}}
