import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createChatServer} from './local.mjs';
test('history UI is quiet on success, without export button, but surfaces failures', {skip:!process.env.RUN_BROWSER_TEST},async()=>{
 const {chromium}=await import('/usr/local/lib/hermes-agent/node_modules/playwright-core/index.mjs');
 const config=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));
 const server=createChatServer({...config,secureCookie:false,publicPath:'/'},{store:{page:async()=>({records:[],next:null,cursor:'0'}),changes:async()=>({records:[],cursor:'0',more:false})},dist:new URL('../'+(process.env.TEST_DIST||'dist')+'/',import.meta.url).pathname});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,executablePath:chromium.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext();await context.addCookies([{name:'chat_session',value:config.accessToken,url:base}]);const page=await context.newPage();
  await page.goto(base);await page.locator('textarea').first().waitFor();
  assert.equal(await page.getByTestId('history-sync-status').isVisible(),false,'normal sync status must not be displayed');
  assert.equal(await page.getByRole('button',{name:'导出备份'}).count(),0);
  await page.route('**/api/history/changes?*',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"offline"}'}));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.getByRole('alert').filter({hasText:'无法刷新'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'重试同步'}).isVisible(),true);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
