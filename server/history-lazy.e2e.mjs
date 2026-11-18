import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createChatServer} from './local.mjs';
import {PostgresHistoryStore} from './history-store.mjs';
test('lazy browser network: bounded boot, pagination, title search, selection race/retry, unloaded rename, project/artifact detail', {skip:!process.env.RUN_BROWSER_TEST,timeout:90000},async()=>{
 const {chromium}=await import('/usr/local/lib/hermes-agent/node_modules/playwright-core/index.mjs');const config=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));const schema=`history_test_lazy_browser_${process.pid}`;const store=new PostgresHistoryStore(config.database,{schema});await store.ready();
 const conversation=id=>({id,title:'懒加载'+id,model:'opus-5',createdAt:1,updatedAt:1,messages:[{id:'msg',role:'user',content:'正文'+id,attachments:[{id:'f',name:'x.txt',type:'text/plain',size:2,textContent:'PRIVATE_LARGE_ATTACHMENT'}],createdAt:1}]});
 for(let i=0;i<36;i++){const id='c'+String(i).padStart(2,'0');await store.write('conversation',id,0,conversation(id));}
 await store.write('project','p',0,{id:'p',name:'懒项目',customInstructions:'PRIVATE_INSTRUCTIONS',files:[],createdAt:1,updatedAt:1});await store.write('artifact','a',0,{id:'a',title:'懒作品',identifier:'a',content:'PRIVATE_ARTIFACT',type:'text/plain',createdAt:1});
 const server=createChatServer({...config,secureCookie:false,publicPath:'/'},{store,dist:new URL('../'+(process.env.TEST_DIST||'dist.lazy-staging'),import.meta.url).pathname,fetch:async()=>{throw Error('No paid upstream');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch({headless:true,executablePath:chromium.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 const context=await browser.newContext({viewport:{width:1280,height:900}});await context.addCookies([{name:'chat_session',value:config.accessToken,url:base}]);await context.addInitScript(()=>{if(window===window.top)localStorage.setItem('claude_pg_migrated_v1','1');});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const requests=[];const payloads=[];page.on('request',r=>{if(r.url().includes('/api/history'))requests.push(new URL(r.url()).pathname+new URL(r.url()).search);});page.on('response',async response=>{if(response.url().includes('/api/history?')||response.url().includes('/changes?'))payloads.push(await response.text());});
 await page.goto(base);await page.getByRole('listitem',{name:'Conversation: 懒加载c35',exact:true}).waitFor();assert.equal(requests.length,1);assert.equal(new URL(requests[0],base).searchParams.get('limit'),'30');assert.equal(await page.getByRole('listitem',{name:'Conversation: 懒加载c00',exact:true}).count(),0);assert.equal(await page.getByTestId('history-sync-status').isVisible(),false);
 await page.getByRole('button',{name:'加载更多历史',exact:true}).click();await page.getByRole('listitem',{name:'Conversation: 懒加载c00',exact:true}).waitFor();
 // Hold A detail: no empty composer. Switch B, then deliver A late.
 let release;const held=new Promise(r=>release=r);let entered;const started=new Promise(r=>entered=r);await page.route('**/api/history/conversation/c35',async route=>{if(route.request().method()==='GET'){entered();await held;}await route.continue();});
 await page.getByRole('listitem',{name:'Conversation: 懒加载c35',exact:true}).click();await started;await page.getByText('正在加载会话…',{exact:true}).waitFor();assert.equal(await page.locator('textarea').count(),0);
 await page.getByRole('listitem',{name:'Conversation: 懒加载c34',exact:true}).click();await page.getByText('正文c34',{exact:true}).waitFor();release();await page.waitForResponse(r=>r.url().endsWith('/conversation/c35'));assert.equal(await page.getByText('正文c35',{exact:true}).count(),0);
 let failure=true;await page.route('**/api/history/conversation/c33',route=>failure?route.fulfill({status:503,contentType:'application/json',body:'{}'}):route.continue());await page.getByRole('listitem',{name:'Conversation: 懒加载c33',exact:true}).click();await page.getByText('会话加载失败，请重试',{exact:false}).waitFor();assert.equal(await page.locator('textarea').count(),0);failure=false;await page.getByRole('button',{name:'重试',exact:true}).click();await page.getByText('正文c33',{exact:true}).waitFor();
 const row=page.getByRole('listitem',{name:'Conversation: 懒加载c00',exact:true});await row.hover();await row.getByRole('button',{name:'More actions'}).click();await page.getByRole('menuitem',{name:'Rename',exact:true}).click();await page.getByRole('textbox',{name:'Rename conversation'}).fill('未打开重命名');const saved=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/conversation/c00'));await page.getByRole('button',{name:'Save',exact:true}).click();await saved;assert.equal((await store.detail('conversation','c00')).data.messages[0].attachments[0].textContent,'PRIVATE_LARGE_ATTACHMENT');
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForResponse(r=>r.url().includes('/changes?'));for(const payload of payloads)assert.doesNotMatch(payload,/PRIVATE_|正文|"messages"|"content"|"files"|customInstructions/);
 // Search reaches histories outside initial page without message scanning.
 await page.keyboard.press('Control+k');await page.getByPlaceholder('搜索所有会话标题…').fill('未打开重命名');await page.getByRole('dialog').getByText('未打开重命名',{exact:true}).waitFor();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Projects',exact:true}).first().click();const projectDetail=page.waitForResponse(r=>r.url().endsWith('/project/p'));await page.getByText('懒项目',{exact:true}).last().click();await projectDetail;assert.ok(requests.some(p=>p==='/api/history/project/p'));
 await page.getByRole('button',{name:'Artifacts',exact:true}).first().click();const artifactDetail=page.waitForResponse(r=>r.url().endsWith('/artifact/a'));await page.getByText('懒作品',{exact:true}).click();await artifactDetail;assert.ok(requests.some(p=>p==='/api/history/artifact/a'));
 await page.unrouteAll({behavior:'wait'});
 await page.goto(base+'/c01');await page.getByText('正文c01',{exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/c01');
 await page.reload();await page.getByText('正文c01',{exact:true}).waitFor();
 await page.getByRole('listitem',{name:'Conversation: 懒加载c34',exact:true}).click();await page.getByText('正文c34',{exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/c34');
 await page.goBack();await page.getByText('正文c01',{exact:true}).waitFor();
 await page.goForward();await page.getByText('正文c34',{exact:true}).waitFor();
 await page.goto(base+'/missing-conversation');await page.getByText('会话加载失败，请重试',{exact:false}).waitFor();assert.equal(await page.locator('textarea').count(),0);
 assert.equal(requests.includes('/api/history'),false);assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(r=>server.close(r));await store.pool.query(`DROP SCHEMA "${schema}" CASCADE`);await store.close();}
});
