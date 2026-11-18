import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {createChatServer} from './local.mjs';

// Run explicitly: CDP_URL=http://127.0.0.1:<port> node --test server/mobile-navigation.e2e.mjs
// Uses isolated browser storage and seeded conversations; no model requests.
test('mobile navigation stays accessible across landing, conversations and projects', {skip: !process.env.CDP_URL && !process.env.RUN_BROWSER_TEST}, async () => {
  const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || '/usr/local/lib/hermes-agent/node_modules/playwright-core/index.mjs');
  const config=JSON.parse(readFileSync(new URL('../runtime.json', import.meta.url),'utf8'));
  const browser=process.env.CDP_URL
    ? await chromium.connectOverCDP(process.env.CDP_URL)
    : await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || chromium.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const server=createChatServer({...config,secureCookie:false,publicPath:'/'},{store:{},dist:new URL('../'+(process.env.TEST_DIST||'dist.lazy-staging'),import.meta.url).pathname});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}/`;
  await context.addCookies([{name:'chat_session',value:config.accessToken,url:base}]);
  try {
    const page=await context.newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    const records=['A','B'].map(id=>({kind:'conversation',id:'test-'+id,version:1,deleted:false,data:{id:'test-'+id,title:'回归会话'+id,model:'opus-5',createdAt:Date.now(),updatedAt:Date.now(),messages:[{id:'m-'+id,role:'user',content:'历史消息'+id,createdAt:Date.now()}]}}));
    await page.route('**/api/history**',route=>{const url=new URL(route.request().url());const detail=records.find(r=>url.pathname===`/api/history/conversation/${r.id}`);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(detail?{record:detail}:url.pathname.endsWith('/changes')?{records:[],cursor:'0',more:false}:{records:records.map(r=>({...r,summary:true,data:{...r.data,messages:undefined}})),next:null,cursor:'0'})});});
    await page.goto(base);
    await page.getByTestId('history-sync-status').filter({hasText:'历史已保存到服务器'}).waitFor({state:'attached'});
    const menu=page.getByRole('button',{name:'打开会话菜单',exact:true});
    const fresh=page.getByRole('button',{name:'新建会话',exact:true});
    async function touchTarget(locator) {
      await locator.waitFor({state:'visible',timeout:2500});
      const b=await locator.boundingBox();
      assert.ok(b && b.x>=0 && b.y>=0 && b.x+b.width<=page.viewportSize().width && b.width>=44 && b.height>=44,'visible on-screen 44px touch target');
    }
    for (const width of [320,390,767]) {
      await page.setViewportSize({width,height:844});
      await touchTarget(menu); await touchTarget(fresh);
      await menu.click();
      assert.equal(await menu.getAttribute('aria-expanded'),'true');
      await page.getByText('回归会话A',{exact:true}).click();
      await page.getByText('历史消息A',{exact:true}).waitFor({state:'visible'});
      assert.equal(await menu.getAttribute('aria-expanded'),'false');
      await touchTarget(menu);
      await menu.click();
      await page.getByText('回归会话B',{exact:true}).click();
      await page.getByText('历史消息B',{exact:true}).waitFor({state:'visible'});
      await fresh.click();
      await page.getByText('历史消息B',{exact:true}).waitFor({state:'hidden'});
      await menu.click(); await page.getByRole('button',{name:'Projects',exact:true}).click();
      await touchTarget(menu); await touchTarget(fresh);
      await fresh.click();
    }
    await page.setViewportSize({width:1280,height:800});
    assert.equal(await menu.isVisible(),false,'mobile navigation hidden on desktop');
    assert.deepEqual(errors,[]);
  } finally {await context.close(); await browser.close();await new Promise(r=>server.close(r));}
});
