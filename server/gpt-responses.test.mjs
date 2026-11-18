import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatServer, MODEL } from './local.mjs';

const accessToken = 'gpt_test_session_12345678901234567890';
const models = ['gpt-6-astra', 'gpt-6.1-sol'];
const legacy = { id: 'month-end', label: 'Claude', endpoint: 'https://claude.invalid/v1', key: 'fake-claude-secret' };
const gpt = { id: 'gpt', label: 'GPT', protocol: 'responses', models, endpoint: 'https://gpt.invalid/v1', key: 'fake-gpt-secret' };
const config = { accessToken, secureCookie: false, channels: [legacy, gpt] };
const headers = { cookie: `chat_session=${accessToken}`, 'content-type': 'application/json' };
const messages = [{ role: 'user', content: 'hello' }];
const sse = events => new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
async function fixture(t, respond = () => sse([{ type: 'response.completed', response: { status: 'completed', output: [] } }]), overrides = {}) {
  const calls = [];
  const server = createChatServer({ ...config, ...overrides }, { store: {}, fetch: async (url, options) => {
    calls.push({ url, ...options }); return respond(url, options);
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, calls, chat: (extra = {}, moreHeaders = {}) => fetch(base + '/api/chat', { method: 'POST', headers: { ...headers, ...moreHeaders }, body: JSON.stringify({ messages, channel: 'gpt', profile: models[0], ...extra }) }) };
}

test('Responses metadata is public-only; legacy channel shape/default remain exact', async t => {
  const { base } = await fixture(t);
  assert.equal((await fetch(base + '/api/channels')).status, 404);
  const metadata = await (await fetch(base + '/api/channels', { headers })).json();
  assert.deepEqual(metadata, { channels: [{ id: legacy.id, label: legacy.label }, { id: gpt.id, label: gpt.label, protocol: 'responses', models }], defaultChannel: 'month-end' });
  const profiles = (await (await fetch(base + '/api/models', { headers })).json()).profiles;
  assert.deepEqual(profiles.map(p => p.id), ['opus-5', ...models]);
});

test('both exact GPT profiles use Responses endpoint and Bearer-only headers/payload', async t => {
  const { calls, chat } = await fixture(t);
  for (const profile of models) {
    const response = await chat({ profile, systemPrompt: 'Custom instruction' });
    assert.equal(response.status, 200); assert.match(await response.text(), /event: done/);
  }
  assert.deepEqual(calls.map(c => c.url), models.map(() => 'https://gpt.invalid/v1/responses'));
  for (const [i, c] of calls.entries()) {
    assert.deepEqual(c.headers, { 'Content-Type': 'application/json', Authorization: `Bearer ${gpt.key}`, 'User-Agent': 'curl/8.5.0' });
    const p = JSON.parse(c.body);
    assert.deepEqual(Object.keys(p).sort(), ['input', 'instructions', 'model', 'reasoning', 'store', 'stream']);
    assert.equal(p.model, models[i]); assert.equal(p.stream, true); assert.equal(p.store, false);
    assert.deepEqual(p.reasoning, { effort: 'high' });
    assert.match(p.instructions, /^Custom instruction/); assert.match(p.instructions, /Asia\/Shanghai/);
    assert.deepEqual(p.input, [{ role: 'user', content: [{ type: 'input_text', text: 'hello' }] }]);
  }
});

test('unsupported and cross-protocol profiles fail before any upstream call', async t => {
  const { calls, chat } = await fixture(t, () => Response.json({ content: [{ type: 'text', text: 'legacy' }] }), { channels: [legacy, { ...gpt, models: [models[0]] }] });
  for (const extra of [{ profile: 'opus-5' }, { profile: models[1] }, { profile: 'gpt-unknown' }, { profile: undefined }, { profile: null }, { profile: {} }, { channel: 'month-end', profile: models[0] }, { channel: 'month-end', profile: 'unknown' }]) {
    assert.equal((await chat(extra)).status, 400);
  }
  assert.equal(calls.length, 0);
  for (const profile of [undefined, 'opus-5']) {
    const response = await chat({ channel: 'month-end', profile }); assert.equal(response.status, 200); await response.text();
  }
  for (const c of calls) { assert.equal(c.url, 'https://claude.invalid/v1/messages'); assert.equal(JSON.parse(c.body).model, MODEL); assert.equal(c.headers['x-api-key'], legacy.key); }
});

test('validated context converts text/image/PDF attachments and assistant output exactly', async t => {
  const { chat, calls } = await fixture(t);
  await (await chat({ messages: [
    { role: 'user', content: 'first' }, { role: 'assistant', content: 'prior answer' },
    { role: 'user', content: 'inspect', attachments: [
      { type: 'text/plain', textContent: 'notes' },
      { type: 'image/png', dataUrl: 'data:image/png;base64,YQ==' },
      { type: 'application/pdf', name: 'report.pdf', dataUrl: 'data:application/pdf;base64,Yg==' },
      { type: 'application/pdf', dataUrl: 'data:application/pdf;base64,Yw==' }
    ] }
  ] })).text();
  assert.deepEqual(JSON.parse(calls[0].body).input, [
    { role: 'user', content: [{ type: 'input_text', text: 'first' }] },
    { role: 'assistant', content: [{ type: 'output_text', text: 'prior answer' }] },
    { role: 'user', content: [
      { type: 'input_text', text: 'inspect' }, { type: 'input_text', text: 'notes' },
      { type: 'input_image', image_url: 'data:image/png;base64,YQ==' },
      { type: 'input_file', filename: 'report.pdf', file_data: 'data:application/pdf;base64,Yg==' },
      { type: 'input_file', filename: 'attachment.pdf', file_data: 'data:application/pdf;base64,Yw==' }
    ] }
  ]);
});

test('Responses web search is explicitly enabled and respects server disable', async t => {
  for (const enabled of [true, false]) {
    const { chat, calls } = await fixture(t, undefined, { webSearch: enabled });
    for (const webSearch of [undefined, false, true]) await (await chat({ webSearch })).text();
    assert.equal(JSON.parse(calls[0].body).tools, undefined);
    assert.equal(JSON.parse(calls[1].body).tools, undefined);
    assert.deepEqual(JSON.parse(calls[2].body).tools, enabled ? [{ type: 'web_search' }] : undefined);
  }
});

test('Responses streams text/reasoning and safe citations without replaying completed output', async t => {
  const annotation = { type: 'url_citation', url: 'https://example.com/source' };
  const { chat } = await fixture(t, () => sse([
    { type: 'response.reasoning_summary_text.delta', delta: 'consider' },
    { type: 'response.output_text.delta', delta: 'answer' },
    { type: 'response.output_text.annotation.added', annotation },
    { type: 'response.output_text.annotation.added', annotation: { url: 'javascript:bad' } },
    { type: 'response.completed', response: { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'answer', annotations: [annotation] }] }] } }
  ]));
  const text = await (await chat()).text();
  assert.match(text, /event: thinking\ndata: {"delta":"consider"}/);
  assert.match(text, /event: text\ndata: {"delta":"answer"}/);
  assert.equal(text.split('answer').length, 2); assert.equal(text.split(annotation.url).length, 2);
  assert.doesNotMatch(text, /javascript:|event: error/); assert.match(text, /event: done/);
});

test('nonstream Responses output supports reasoning, text and citations', async t => {
  const { chat } = await fixture(t, () => Response.json({ status: 'completed', output: [
    { type: 'reasoning', summary: [{ type: 'summary_text', text: 'reason' }] },
    { type: 'message', content: [{ type: 'output_text', text: 'JSON answer', annotations: [{ type: 'url_citation', url: 'https://example.com/json' }] }] }
  ] }));
  const text = await (await chat()).text();
  assert.match(text, /event: thinking\ndata: {"delta":"reason"}/); assert.match(text, /JSON answer/);
  assert.match(text, /https:\/\/example.com\/json/); assert.match(text, /event: done/); assert.doesNotMatch(text, /event: error/);
});

test('Responses failures and false completion never emit success or private errors', async t => {
  const privateError = `${gpt.key} ${gpt.endpoint}`;
  const badEvents = [
    [{ type: 'response.failed', response: { error: { message: privateError } } }],
    [{ type: 'response.incomplete', response: { incomplete_details: { reason: privateError } } }],
    [{ type: 'error', message: privateError }],
    [{ type: 'response.output_text.delta', delta: 'partial' }],
    [{ type: 'message_stop' }],
    [{ type: 'response.completed', response: { status: 'incomplete' } }],
    [{ type: 'response.completed', response: { status: 'failed' } }],
    [{ type: 'response.completed', response: { status: 'completed', error: { message: privateError } } }]
  ];
  for (const events of badEvents) {
    const { chat } = await fixture(t, () => sse(events));
    const text = await (await chat()).text();
    assert.match(text, /event: error/); assert.doesNotMatch(text, /event: done/);
    assert.ok(!text.includes(gpt.key)); assert.ok(!text.includes(gpt.endpoint));
  }
  for (const result of [{ status: 'failed', output: [] }, { status: 'incomplete', output: [] }, { output: [] }, { status: 'completed' }, { status: 'completed', output: [], error: { message: privateError } }]) {
    const { chat } = await fixture(t, () => Response.json(result));
    const text = await (await chat()).text(); assert.match(text, /event: error/); assert.doesNotMatch(text, /event: done/);
    assert.ok(!text.includes(gpt.key));
  }
});

test('Responses keeps authentication, origin, attachment and context validation before upstream', async t => {
  const { chat, calls } = await fixture(t);
  assert.equal((await chat({}, { cookie: '' })).status, 404);
  assert.equal((await chat({}, { origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await chat({}, { 'content-type': 'text/plain' })).status, 415);
  for (const extra of [
    { webSearch: 'yes' }, { systemPrompt: 'x'.repeat(32001) },
    { messages: [{ role: 'system', content: 'bad' }] },
    { messages: [{ role: 'assistant', content: 'bad' }] },
    { messages: [{ role: 'user', content: 'x'.repeat(200001) }] },
    { messages: [{ role: 'user', content: '', attachments: [{ type: 'image/png', dataUrl: 'https://evil.invalid/image' }] }] },
    { messages: [{ role: 'user', content: '', attachments: [{ type: 'application/pdf', dataUrl: 'data:application/pdf;base64,!' }] }] }
  ]) assert.equal((await chat(extra)).status, 400);
  assert.equal(calls.length, 0);
});

test('Responses client disconnect aborts upstream and preserves two-request cap', async t => {
  let started = 0, aborted = 0;
  const { base } = await fixture(t, (_url, options) => new Promise((_resolve, reject) => {
    started++;
    options.signal.addEventListener('abort', () => { aborted++; reject(new Error('aborted')); }, { once: true });
  }));
  const controllers = [new AbortController(), new AbortController()];
  const request = signal => fetch(base + '/api/chat', { method: 'POST', headers, signal, body: JSON.stringify({ messages, channel: 'gpt', profile: models[0] }) });
  const pending = controllers.map(c => request(c.signal).catch(() => {}));
  for (let i = 0; i < 200 && started < 2; i++) await new Promise(r => setTimeout(r, 5));
  assert.equal(started, 2); assert.equal((await request()).status, 429);
  controllers.forEach(c => c.abort()); await Promise.all(pending);
  for (let i = 0; i < 200 && aborted < 2; i++) await new Promise(r => setTimeout(r, 5));
  assert.equal(aborted, 2);
});

test('Responses endpoint normalization and omitted model allowlist work without changing defaults', async t => {
  for (const endpoint of ['https://gpt.invalid', 'https://gpt.invalid/v1/', 'https://gpt.invalid/v1/responses']) {
    const { calls, chat } = await fixture(t, undefined, { channels: [legacy, { ...gpt, endpoint, models: undefined }] });
    for (const profile of models) await (await chat({ profile })).text();
    assert.deepEqual(calls.map(c => c.url), models.map(() => 'https://gpt.invalid/v1/responses'));
  }
});

test('upstream HTTP and malformed stream errors remain safe for Responses', async t => {
  for (const respond of [
    () => new Response(gpt.key, { status: 401 }),
    () => new Response('data: invalid\n\n', { headers: { 'content-type': 'text/event-stream' } }),
    () => new Response('data: {', { headers: { 'content-type': 'text/event-stream' } })
  ]) {
    const { chat } = await fixture(t, respond);
    const res = await chat(); const text = await res.text();
    assert.ok(res.status === 502 || text.includes('event: error')); assert.doesNotMatch(text, /event: done/);
    assert.ok(!text.includes(gpt.key));
  }
});

test('invalid protocol/model configuration fails closed', () => {
  for (const change of [{ protocol: 'unknown' }, { models: [] }, { models: ['gpt-unknown'] }, { models: [models[0], models[0]] }, { models: 'gpt-6-astra' }, { models: null }]) {
    assert.throws(() => createChatServer({ ...config, channels: [legacy, { ...gpt, ...change }] }), /Invalid channel configuration/);
  }
});
