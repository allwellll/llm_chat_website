import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { authenticated, secretEqual, staticPath, publicPath, chatPayload, messagesEndpoint, sseObjects, createChatServer, MODEL, MAX_BODY } from './local.mjs';
const token = 'test_only_token_12345678901234567890';
const config = { endpoint: 'https://invalid.example/v1', key: 'never-send-test-key', accessToken: token, publicPath: '/claude-test/', webSearch: true, secureCookie: false };
const payload = { messages: [{ role: 'user', content: 'hello' }], modelOverride: 'bad-model' };
const headers = { cookie: `chat_session=${token}`, 'content-type': 'application/json' };
async function fixture(t, upstream) {
  const dir = await mkdtemp(path.join(tmpdir(), 'private-opus-test-'));
  await writeFile(path.join(dir, 'index.html'), '<html>private</html>');
  await writeFile(path.join(dir, 'hidden.map'), 'secret');
  await symlink('/etc/passwd', path.join(dir, 'escape.html'));
  const server = createChatServer(config, { dist: dir, fetch: upstream || (() => { throw new Error('No network allowed'); }) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  return `http://127.0.0.1:${server.address().port}`;
}
test('per-request search defaults off and explicit true enables tools', () => {
  assert.equal(chatPayload(payload, config).tools, undefined);
  assert.ok(chatPayload({ ...payload, webSearch: true }, config).tools);
  assert.equal(chatPayload({ ...payload, webSearch: false }, config).tools, undefined);
  assert.equal(chatPayload({ ...payload, webSearch: true }, { ...config, webSearch: false }).tools, undefined);
  assert.throws(() => chatPayload({ ...payload, webSearch: 'false' }, config));
});
test('constant-time auth and duplicate-cookie rejection', () => {
  assert.equal(secretEqual('same', 'same'), true); assert.equal(secretEqual('same', 'x'), false);
  assert.equal(authenticated(`x=1; chat_session=${token}`, token), true);
  for (const c of ['', 'chat_session=bad', `chat_session=${token}; chat_session=${token}`, `chat_session=${token}%00`]) assert.equal(authenticated(c, token), false);
});
test('public path and static containment', () => {
  assert.equal(publicPath('/claude-test/'), '/claude-test/');
  for (const p of ['//evil/', '/x', '/x/../', '/x;foo/']) assert.throws(() => publicPath(p));
  for (const p of ['/../runtime.json', '/%2eenv', '/x.map', '/%00', '/a\\b', '/%ZZ']) assert.equal(staticPath(p, '/tmp/dist'), null);
  assert.equal(staticPath('/assets/a.js', '/tmp/dist'), '/tmp/dist/assets/a.js');
});
test('fixed model, thinking, web search, context limits and role whitelist', () => {
  const p = chatPayload({ ...payload, webSearch: true }, config);
  assert.equal(p.model, MODEL); assert.equal(p.max_tokens, 8196); assert.deepEqual(p.thinking, { type: 'adaptive' }); assert.equal(p.output_config.effort, 'high');
  assert.equal(p.tools[0].type, 'web_search_20260209'); assert.equal(chatPayload(payload, { webSearch: false }).tools, undefined);
  for (const messages of [[], [{ role: 'system', content: 'x' }], [{ role: 'tool', content: 'x' }], [{ role: 'user', content: 1 }], [{ role: 'user', content: 'x'.repeat(200001) }]]) assert.throws(() => chatPayload({ messages }, config));
  assert.throws(() => chatPayload({ ...payload, systemPrompt: 'x'.repeat(32001) }, config));
});
test('image, text, PDF attachments validated and URLs rejected', () => {
  for (const type of ['image/png', 'application/pdf']) {
    const p = chatPayload({ messages: [{ role: 'user', content: '', attachments: [{ type, dataUrl: `data:${type};base64,YQ==` }] }] }, config);
    assert.equal(p.messages[0].content[0].type, type === 'image/png' ? 'image' : 'document');
  }
  const text = chatPayload({ messages: [{ role: 'user', content: '', attachments: [{ type: 'text/plain', textContent: 'file' }] }] }, config);
  assert.equal(text.messages[0].content[0].text, 'file');
  assert.throws(() => chatPayload({ messages: [{ role: 'user', content: 'x', attachments: [{ type: 'image/png', dataUrl: 'https://evil/' }] }] }, config));
});
test('endpoint normalization', () => {
  assert.equal(messagesEndpoint('https://example.com'), 'https://example.com/v1/messages');
  assert.equal(messagesEndpoint('https://example.com/v1/'), 'https://example.com/v1/messages');
  assert.equal(messagesEndpoint('https://example.com/v1/messages'), 'https://example.com/v1/messages');
  assert.throws(() => messagesEndpoint('file:///etc/passwd'));
});
test('SSE parsing handles fragmented UTF-8 and CRLF', async () => {
  const bytes = Buffer.from('event: delta\r\ndata: {"type":"text_delta","text":"你好"}\r\n\r\ndata: {"type":"message_stop"}\n\n');
  async function* chunks() { for (let i = 0; i < bytes.length; i++) yield bytes.subarray(i, i + 1); }
  const result = []; for await (const e of sseObjects(chunks())) result.push(e);
  assert.deepEqual(result, [{ type: 'text_delta', text: '你好' }, { type: 'message_stop' }]);
});
test('public login form validates password and grants private session', async t => {
  const base = await fixture(t);
  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('referrer-policy'), 'same-origin');
  const html = await page.text();
  assert.match(html, /type="password"/);
  assert.ok(!html.includes(token));
  assert.match(html, /action="\/claude-test\/login"/);
  const bad = await fetch(base + '/login', { method: 'POST', body: new URLSearchParams({ password: 'wrong' }), redirect: 'manual' });
  assert.equal(bad.status, 401); assert.equal(bad.headers.get('set-cookie'), null);
  const good = await fetch(base + '/login', { method: 'POST', body: new URLSearchParams({ password: token }), redirect: 'manual' });
  assert.equal(good.status, 303); assert.match(good.headers.get('set-cookie'), /HttpOnly/);
  assert.equal((await fetch(base + '/api/health', { headers: { cookie: good.headers.get('set-cookie').split(';')[0] } })).status, 200);
});
test('all routes private, login path and secure cookies, safe files only', async t => {
  const base = await fixture(t);
  for (const url of ['/api/models', '/api/health', '/runtime.json', '/login?token=bad']) assert.equal((await fetch(base + url)).status, 404);
  const login = await fetch(base + '/login?token=' + token, { redirect: 'manual' });
  assert.equal(login.status, 303); assert.equal(login.headers.get('location'), '/claude-test/');
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Path=\/claude-test\//);
  assert.equal((await fetch(base + '/', { headers })).status, 200);
  assert.equal((await (await fetch(base + '/api/health', { headers })).json()).model, MODEL);
  assert.equal((await (await fetch(base + '/api/models', { headers })).json()).profiles.length, 1);
  for (const url of ['/runtime.json', '/.env', '/hidden.map', '/escape.html', '/src/main.tsx', '/package.json']) assert.equal((await fetch(base + url, { headers })).status, 404);
});
test('authenticated conversation deep links serve the SPA while unsafe and unknown routes stay 404', async t => {
  const base = await fixture(t);
  assert.equal((await fetch(base + '/conv-123-abc', { headers })).status, 200);
  assert.equal((await fetch(base + '/conv-123-abc/extra', { headers })).status, 404);
  assert.equal((await fetch(base + '/not-a-session', { headers })).status, 200);
  assert.equal((await fetch(base + '/conv-123-abc')).status, 404);
});
test('chat translates thinking/text/citations and forces model', async t => {
  let sent;
  const events = [
    { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'reason' } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hello' } },
    { type: 'content_block_delta', delta: { type: 'citations_delta', citation: { url: 'https://example.com/source' } } },
    { type: 'message_stop' }
  ];
  const base = await fixture(t, async (_url, options) => { sent = JSON.parse(options.body); return new Response(events.map(x => `data: ${JSON.stringify(x)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } }); });
  const result = await fetch(base + '/api/chat', { method: 'POST', headers, body: JSON.stringify(payload) });
  const text = await result.text();
  assert.equal(result.status, 200); assert.equal(sent.model, MODEL);
  assert.match(text, /event: thinking/); assert.match(text, /event: text/); assert.match(text, /Sources/); assert.match(text, /event: done/);
});
test('JSON fallback and generic errors never leak upstream credentials', async t => {
  let fail = false;
  const base = await fixture(t, async () => fail ? new Response(config.key, { status: 401 }) : Response.json({ content: [{ type: 'text', text: 'fallback' }] }));
  const request = () => fetch(base + '/api/chat', { method: 'POST', headers, body: JSON.stringify(payload) });
  assert.match(await (await request()).text(), /fallback/); fail = true;
  const result = await request(); assert.equal(result.status, 502); assert.equal((await result.text()).includes(config.key), false);
});
test('malformed JSON, oversized bodies, bad origin and roles rejected before upstream', async t => {
  const base = await fixture(t);
  const request = (body, extra = {}) => fetch(base + '/api/chat', { method: 'POST', headers: { ...headers, ...extra }, body });
  assert.equal((await request('{')).status, 400);
  assert.equal((await request(JSON.stringify({ messages: [{ role: 'system', content: 'x' }] }))).status, 400);
  assert.equal((await request(JSON.stringify(payload), { origin: 'https://evil.example' })).status, 403);
  assert.equal((await request('x'.repeat(MAX_BODY + 1))).status, 413);
});
test('concurrency cap two and abort on client disconnect', async t => {
  let count = 0, aborted = 0;
  const base = await fixture(t, (_url, options) => new Promise((_resolve, reject) => {
    count++; options.signal.addEventListener('abort', () => { aborted++; reject(new Error('Aborted')); }, { once: true });
  }));
  const controllers = [new AbortController(), new AbortController()];
  const pending = controllers.map(c => fetch(base + '/api/chat', { method: 'POST', headers, body: JSON.stringify(payload), signal: c.signal }).catch(() => {}));
  while (count < 2) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await fetch(base + '/api/chat', { method: 'POST', headers, body: JSON.stringify(payload) })).status, 429);
  controllers.forEach(c => c.abort()); await Promise.all(pending);
  for (let i = 0; i < 100 && aborted !== 2; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(aborted, 2);
});
