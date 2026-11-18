import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createChatServer } from './local.mjs';
import { PostgresHistoryStore } from './history-store.mjs';
test('browser: legacy migration, second device, retry, CAS conflict, stream, delete and reload', {skip:!process.env.RUN_BROWSER_TEST,timeout:120000},async()=>{
 const {chromium}=await import('/usr/local/lib/hermes-agent/node_modules/playwright-core/index.mjs');
 const config=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));
 const schema=`history_test_browser_${process.pid}_${Date.now()}`;
 const store=new PostgresHistoryStore(config.database,{schema});await store.ready();
 const server=createChatServer({...config,secureCookie:false,publicPath:'/'},{store,dist:new URL('../'+(process.env.TEST_DIST||'dist.lazy-staging'),import.meta.url).pathname,fetch:async()=>{throw Error('No paid upstream');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,executablePath:chromium.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage']});
 const errors=[];
 try{
  const contexts=[];const pages=[];
  for(let i=0;i<2;i++){
   const ctx=await browser.newContext({viewport:{width:1280,height:900}});contexts.push(ctx);await ctx.addCookies([{name:'chat_session',value:config.accessToken,url:base}]);
   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));pages.push(page);
  }
  const [a,b]=pages;
  const legacy={id:'browser-legacy',title:'迁移会话',model:'opus-5',createdAt:1,updatedAt:1,messages:[{id:'m',role:'assistant',content:'完整历史',thinkingContent:'保留思考',createdAt:1}],projectId:'missing-project'};
  await contexts[0].addInitScript(value=>{if(!localStorage.getItem('seeded')){localStorage.setItem('claude_conversations_v3',JSON.stringify([value]));localStorage.setItem('seeded','1');}},legacy);
  await a.goto(base);await a.getByTestId('history-sync-status').filter({hasText:'历史已保存到服务器'}).waitFor({state:'attached'});
  await a.getByRole('listitem',{name:'Conversation: 迁移会话',exact:true}).click();await a.getByText('完整历史',{exact:true}).waitFor();
  assert.equal(await a.evaluate(()=>JSON.parse(localStorage.getItem('claude_conversations_v3'))[0].title),'迁移会话');
  await b.goto(base);await b.getByRole('listitem',{name:'Conversation: 迁移会话',exact:true}).waitFor();
  async function rename(page,oldTitle,newTitle){const row=page.getByRole('listitem',{name:'Conversation: '+oldTitle,exact:true});await row.hover();await row.getByRole('button',{name:'More actions'}).click();await page.getByRole('menuitem',{name:'Rename',exact:true}).click();await page.getByRole('textbox',{name:'Rename conversation'}).fill(newTitle);await page.getByRole('button',{name:'Save',exact:true}).click();}
  let fail=true;
  await a.route('**/api/history/conversation/*',async route=>{if(fail&&route.request().method()==='PUT')return route.fulfill({status:503,contentType:'application/json',body:'{"error":"offline"}'});return route.continue();});
  await rename(a,'迁移会话','离线编辑');await a.getByRole('alert').filter({hasText:'历史尚未保存'}).waitFor();await a.getByRole('listitem',{name:'Conversation: 离线编辑',exact:true}).waitFor();
  fail=false;await a.getByRole('button',{name:'重试同步'}).click();await a.getByTestId('history-sync-status').filter({hasText:'历史已保存到服务器'}).waitFor({state:'attached'});
  // B still has revision 1. Its stale edit cannot overwrite A's revision 2.
  await rename(b,'迁移会话','设备B编辑');await b.getByRole('alert').filter({hasText:'冲突副本'}).waitFor();await b.getByRole('listitem',{name:'Conversation: 设备B编辑（冲突副本）',exact:true}).waitFor();
  const records=await store.list();assert.equal(records.find(r=>r.id==='browser-legacy').data.title,'离线编辑');assert.ok(records.find(r=>r.data?.title==='设备B编辑（冲突副本）'));
  await a.route('**/api/chat',route=>route.fulfill({status:200,contentType:'text/event-stream',body:'event: thinking\ndata: {"delta":"测试思考"}\n\nevent: text\ndata: {"delta":"测试回复"}\n\nevent: done\ndata: {}\n\n'}));
  await a.getByRole('button',{name:'New chat',exact:true}).click();const textarea=a.locator('textarea').first();await textarea.fill('新会话测试');await textarea.press('Enter');await a.getByText('测试回复',{exact:true}).waitFor();await a.getByTestId('history-sync-status').filter({hasText:'历史已保存到服务器'}).waitFor({state:'attached'});
  assert.ok((await store.list()).some(r=>r.data?.messages?.some(m=>m.thinkingContent==='测试思考')));
  const row=a.getByRole('listitem',{name:'Conversation: 离线编辑',exact:true});await row.hover();await row.getByRole('button',{name:'More actions'}).click();const deletion=a.waitForResponse(r=>r.request().method()==='DELETE'&&r.url().includes('/api/history/conversation/browser-legacy'));await a.getByRole('menuitem',{name:'Delete',exact:true}).click();assert.equal((await deletion).status(),200);await row.waitFor({state:'detached'});await a.getByTestId('history-sync-status').filter({hasText:'历史已保存到服务器'}).waitFor({state:'attached'});
  await a.reload();await a.getByTestId('history-sync-status').filter({hasText:'历史已保存到服务器'}).waitFor({state:'attached'});assert.equal(await a.getByRole('listitem',{name:'Conversation: 离线编辑',exact:true}).count(),0);
  assert.equal((await store.list()).find(r=>r.id==='browser-legacy').deleted,true);
  await b.reload();await b.getByRole('listitem',{name:'Conversation: 新会话测试',exact:true}).waitFor();assert.equal(await b.getByRole('listitem',{name:'Conversation: 离线编辑',exact:true}).count(),0);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(r=>server.close(r));await store.pool.query(`DROP SCHEMA "${schema}" CASCADE`);await store.close();}
});
