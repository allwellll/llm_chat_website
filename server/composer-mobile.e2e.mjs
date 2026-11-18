import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createChatServer} from './local.mjs';
import {chromium} from '/usr/local/lib/hermes-agent/node_modules/playwright-core/index.mjs';
test('composer fits a single row, switches search, opens menus and enables send', async()=>{
 const config=JSON.parse(readFileSync(new URL('../runtime.json',import.meta.url)));
 const server=createChatServer({...config,secureCookie:false,publicPath:'/'},{store:{},dist:new URL('../'+(process.env.TEST_DIST||'dist.composer-staging'),import.meta.url).pathname});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/`;
 const browser=await chromium.launch({headless:true,executablePath:'/root/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',args:['--no-sandbox','--disable-dev-shm-usage','--renderer-process-limit=1']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addCookies([{name:'chat_session',value:config.accessToken,url:base}]);
 const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/history**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:[],next:null,cursor:'0',more:false})}));
 try {
  await page.goto(base); await page.locator('.composer-toolbar').waitFor();
  for(const width of [320,360,390,430,1280]) {
   await page.setViewportSize({width,height:844});
   const geometry=await page.locator('.composer-toolbar').evaluate(el=>{
    const card=el.parentElement.getBoundingClientRect();
    return {left:card.left,right:card.right,buttons:[...el.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width>0).map(b=>{const r=b.getBoundingClientRect();return {title:b.title||b.textContent,x:r.x,right:r.right,y:r.y,h:r.height}})};
   });
   for(const b of geometry.buttons) assert.ok(b.x>=geometry.left && b.right<=geometry.right+1,`${width}: ${JSON.stringify(b)} outside card ${JSON.stringify(geometry)}`);
   if(width<640) assert.ok(Math.max(...geometry.buttons.map(b=>b.y))-Math.min(...geometry.buttons.map(b=>b.y))<2,'single row');
   const search=page.getByRole('switch',{name:'网页检索'}); const before=await search.getAttribute('aria-checked');await search.click();assert.notEqual(await search.getAttribute('aria-checked'),before);
   await page.getByRole('button',{name:/Opus 5.5/}).click();
   const menu=page.getByText('Private API · adaptive thinking · high effort');await menu.waitFor();const box=await menu.locator('..').boundingBox();assert.ok(box.x>=0 && box.x+box.width<=width+1,`model menu width ${width}`);
   await page.getByRole('button',{name:/Opus 5.5/}).click();
   await page.locator('textarea').fill('Layout test, do not send');assert.equal(await page.getByTitle('Send message (Enter)').isEnabled(),true);
   console.log('verified width',width,'visible toolbar buttons',geometry.buttons.length);
   if(width===390) await page.screenshot({path:'/tmp/claude-composer-mobile.png'});
  }
  assert.deepEqual(errors,[]);
 } finally {await context.close();await browser.close();await new Promise(r=>server.close(r));}
});
