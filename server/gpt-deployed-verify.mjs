import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '/usr/local/lib/hermes-agent/node_modules/playwright-core/index.mjs';
const cfg=JSON.parse(await readFile('runtime.json','utf8'));const base='https://xiaohetongxue.top/claude/';
const browser=await chromium.launch({headless:true,executablePath:'/root/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage','--renderer-process-limit=1']});
try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await ctx.addCookies([{name:'chat_session',value:cfg.accessToken,domain:'xiaohetongxue.top',path:'/claude/',httpOnly:true,secure:true,sameSite:'Strict'}]);
 await ctx.addInitScript(()=>{if(window===window.top)localStorage.setItem('claude_pg_migrated_v1','1');});
 const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const calls=[];
 await page.route('**/api/**',r=>{
  const p=new URL(r.request().url()).pathname;
  if(p.endsWith('/api/channels'))return r.continue();
  if(p.endsWith('/api/chat')){calls.push(r.request().postDataJSON());return r.fulfill({contentType:'text/event-stream',body:'event: text\ndata: {"delta":"部署验证"}\n\nevent: done\ndata: {}\n\n'});}
  if(p.includes('/api/history'))return r.fulfill({json:{records:[],cursor:'0',next:null,more:false}});
  return r.abort();
 });
 await page.goto(base);const trigger=page.getByRole('button',{name:/选择模型/});await trigger.waitFor();
 for(const model of ['gpt-6-astra','gpt-6.1-sol']){
  await trigger.click();await page.getByRole('menuitemradio',{name:`${model} cheap_6_1_sol`,exact:true}).click();assert.ok((await trigger.getAttribute('aria-label')).includes(model));
 }
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 const scripts=await page.locator('script[src]').evaluateAll(es=>es.map(e=>e.src));assert.ok(scripts.some(s=>s.includes('index-D4W3FzrP.js')));
 console.log('PASS authenticated HTTPS deployed assets + real channel metadata + both GPT selections + 390px no overflow; chat/history mocked, no DB writes');
 await ctx.close();
}finally{await browser.close();}
