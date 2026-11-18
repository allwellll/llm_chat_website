import http from 'node:http';
import { PostgresHistoryStore, validId, validateRecord } from './history-store.mjs';
import { timingSafeEqual } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MODEL = 'claude-opus-5-5';
const GPT_MODELS = ['gpt-6-astra', 'gpt-6.1-sol'];
export const MAX_BODY = 10 * 1024 * 1024;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function secretEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function authenticated(cookie, token) {
  const values = String(cookie || '').split(';').map(x => x.trim()).filter(x => x.startsWith('chat_session='));
  return values.length === 1 && secretEqual(values[0].slice(13), token);
}
export function publicPath(value = '/') {
  if (typeof value !== 'string' || !/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(value)) throw new Error('Invalid publicPath (must start and end with /)');
  return value;
}
export function staticPath(urlPath, dist) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some(p => p.startsWith('.') || p === '..') || /\.map$/i.test(decoded)) return null;
  const target = path.resolve(dist, '.' + decoded);
  return target.startsWith(path.resolve(dist) + path.sep) ? target : null;
}
function bad(message = 'Invalid chat payload') { throw Object.assign(new Error(message), { status: 400 }); }
export function chatPayload(body, config, now = new Date()) {
  if (!body || !Array.isArray(body.messages) || !body.messages.length || body.messages.length > 200) bad();
  if (body.webSearch !== undefined && typeof body.webSearch !== 'boolean') bad('webSearch must be boolean');
  const system = body.systemPrompt ?? '';
  if (typeof system !== 'string' || system.length > 32000) bad('System prompt too long');
  let total = system.length;
  const messages = body.messages.map(m => {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 200000) bad();
    total += m.content.length;
    const content = m.content ? [{ type: 'text', text: m.content }] : [];
    if (m.attachments !== undefined && (!Array.isArray(m.attachments) || m.attachments.length > 10 || m.role !== 'user')) bad();
    for (const a of m.attachments || []) {
      if (!a || typeof a.type !== 'string') bad('Invalid attachment');
      if (typeof a.textContent === 'string' && (a.type.startsWith('text/') || ['application/json', 'application/xml'].includes(a.type))) {
        if (a.textContent.length > 200000) bad('Attachment too long');
        total += a.textContent.length;
        content.push({ type: 'text', text: a.textContent });
      } else {
        const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];
        if (!allowed.includes(a.type) || typeof a.dataUrl !== 'string') bad('Unsupported attachment');
        const prefix = `data:${a.type};base64,`;
        const data = a.dataUrl.slice(prefix.length);
        if (!a.dataUrl.startsWith(prefix) || !data || data.length > 9000000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 !== 0) bad('Invalid attachment data');
        content.push({ type: a.type === 'application/pdf' ? 'document' : 'image', source: { type: 'base64', media_type: a.type, data } });
      }
    }
    if (!content.length) bad('Empty message');
    return { role: m.role, content };
  });
  if (messages[0].role !== 'user' || messages.at(-1).role !== 'user' || total > 500000) bad('Invalid or oversized context');
  // Append a fresh server-clock snapshot; retain the stable custom-prompt prefix.
  const timeZone = 'Asia/Shanghai';
  const localTime = new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now);
  const weekday = new Intl.DateTimeFormat('zh-CN', { timeZone, weekday: 'long' }).format(now);
  const timeContext = `[当前时间信息]\n请求发起时的北京时间：${localTime}（${weekday}）。时区：Asia/Shanghai（UTC+08:00）。\n涉及“今天、昨天、明天”等相对日期时，以此时间为基准；这不是实时更新的时钟，也不代表你掌握了最新事件。`;
  const codeOutputPolicy = '仅当用户明确要求生成代码时，才使用上述代码及 Artifact 输出方式；其他任务直接正常回答。';
  const fullSystem = [system, codeOutputPolicy, timeContext].filter(Boolean).join('\n\n');
  return { model: MODEL, max_tokens: 8196, stream: true, system: fullSystem, messages,
    thinking: { type: 'adaptive' }, output_config: { effort: 'high' },
    ...(config.webSearch !== false && body.webSearch === true ? { tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }] } : {}) };
}
function responsesPayload(body, validated) {
  const input = validated.messages.map((message, i) => {
    const pdfs = (body.messages[i].attachments || []).filter(a => a.type === 'application/pdf');
    let pdfIndex = 0;
    return { role: message.role, content: message.content.map(block => {
      if (block.type === 'text') return { type: message.role === 'assistant' ? 'output_text' : 'input_text', text: block.text };
      const data = `data:${block.source.media_type};base64,${block.source.data}`;
      if (block.type === 'image') return { type: 'input_image', image_url: data };
      const name = pdfs[pdfIndex++].name;
      const filename = typeof name === 'string' && name.length <= 255 && name.trim() && !/[\x00-\x1f\x7f/\\]/.test(name) ? name : 'attachment.pdf';
      return { type: 'input_file', filename, file_data: data };
    }) };
  });
  return { model: body.profile, input, instructions: validated.system, stream: true, store: false, reasoning: { effort: 'high' },
    ...(validated.tools ? { tools: [{ type: 'web_search' }] } : {}) };
}
export function messagesEndpoint(endpoint, protocol) {
  const url = new URL(endpoint);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid endpoint');
  let pathname = url.pathname.replace(/\/+$/, '');
  const resource = protocol === 'responses' ? 'responses' : 'messages';
  if (!pathname.endsWith('/' + resource)) pathname += pathname.endsWith('/v1') ? '/' + resource : '/v1/' + resource;
  url.pathname = pathname;
  return url.href;
}
export async function* sseObjects(stream) {
  const decoder = new TextDecoder(); let buffer = '';
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r/g, '');
    if (buffer.length > MAX_BODY) throw new Error('Oversized upstream event');
    let pos;
    while ((pos = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, pos); buffer = buffer.slice(pos + 2);
      const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
      if (data && data !== '[DONE]') { try { yield JSON.parse(data); } catch { throw new Error('Malformed upstream stream'); } }
    }
  }
  if (buffer.trim()) throw new Error('Truncated upstream stream');
}
async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Payload exceeds 10MB'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { bad('Invalid JSON'); }
}
function channelConfig(config) {
  // Legacy credentials stay on their original quality channel; never relabel as month-end.
  const list = config.channels === undefined
    ? [{ id: 'claudecode-quality', label: 'claudecode-quality', endpoint: config.endpoint, key: config.key }]
    : config.channels;
  const channels = new Map();
  try {
    if (!Array.isArray(list) || !list.length || list.length > 32) throw new Error();
    for (const c of list) {
      if (!c || typeof c.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(c.id) || channels.has(c.id)
        || typeof c.label !== 'string' || !c.label.trim() || c.label.length > 80
        || typeof c.key !== 'string' || !c.key.trim() || /[\r\n]/.test(c.key)) throw new Error();
      if (c.protocol !== undefined && !['anthropic', 'responses'].includes(c.protocol)) throw new Error();
      const models = c.models === undefined ? GPT_MODELS : c.models;
      if (c.protocol === 'responses' && (!Array.isArray(models) || !models.length || new Set(models).size !== models.length || models.some(m => !GPT_MODELS.includes(m)))) throw new Error();
      channels.set(c.id, { id: c.id, label: c.label, endpoint: messagesEndpoint(c.endpoint, c.protocol), key: c.key,
        ...(c.protocol === 'responses' ? { protocol: 'responses', models: [...models] } : {}) });
    }
    const defaultChannel = config.defaultChannel === undefined
      ? (channels.has('month-end') ? 'month-end' : channels.keys().next().value)
      : config.defaultChannel;
    if (typeof defaultChannel !== 'string' || !channels.has(defaultChannel)) throw new Error();
    return { channels, defaultChannel };
  } catch { throw new Error('Invalid channel configuration'); }
}
export function createChatServer(config, options = {}) {
  const prefix = publicPath(config.publicPath);
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(config.accessToken || '')) throw new Error('Invalid runtime credentials');
  if (config.model && config.model !== MODEL) throw new Error('Only claude-opus-5-5 is enabled');
  const { channels, defaultChannel } = channelConfig(config);
  const dist = path.resolve(options.dist || path.join(root, 'dist'));
  const fetchUpstream = options.fetch || fetch;
  const store = options.store || (config.database ? new PostgresHistoryStore(config.database) : null);
  let active = 0;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/login' && secretEqual(url.searchParams.get('token'), config.accessToken)) {
        res.writeHead(303, { 'Set-Cookie': `chat_session=${config.accessToken}; HttpOnly; SameSite=Strict; Path=${prefix}${config.secureCookie !== false ? '; Secure' : ''}`, Location: prefix }); res.end(); return;
      }
      const loginPage = (status = 200) => {
        res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Claude · 登录</title><style>body{margin:0;background:#191816;color:#ecebe7;font:16px system-ui;display:grid;place-items:center;min-height:100vh}main{width:min(340px,80vw);padding:32px;background:#22211f;border-radius:20px}h1{font:36px Georgia;margin:0 0 12px;color:#da7756}p{color:#aaa79f;line-height:1.6}input,button{box-sizing:border-box;width:100%;padding:13px;border-radius:9px;font:inherit;margin:8px 0}input{background:#191816;color:#fff;border:1px solid #504d46}button{background:#da7756;border:0;color:#fff;cursor:pointer}.error{color:#ffb4a6}</style><main><h1>✳ Claude</h1><p>私人 AI 工作台 · 请输入访问口令</p>${status === 401 ? '<p class="error">口令不正确，请重试。</p>' : ''}<form method="post" action="${prefix}login"><label for="password">访问口令</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="256" required autofocus><button type="submit">登录</button></form><p>当前连接未必经过加密，请勿在公共网络输入敏感信息。</p></main></html>`);
      };
      if (req.method === 'POST' && url.pathname === '/login') {
        if (req.headers.origin && req.headers.origin !== `${config.secureCookie !== false ? 'https' : 'http'}://${req.headers.host}`) { json(403, { error: 'Invalid origin' }); return; }
        if (!String(req.headers['content-type']).startsWith('application/x-www-form-urlencoded')) { json(415, { error: 'Form required' }); return; }
        let body = ''; for await (const chunk of req) { body += chunk.toString(); if (body.length > 2048) { json(413, { error: 'Form too large' }); return; } }
        if (!secretEqual(new URLSearchParams(body).get('password'), config.loginPassword || config.accessToken)) { loginPage(401); return; }
        res.writeHead(303, { 'Set-Cookie': `chat_session=${config.accessToken}; HttpOnly; SameSite=Strict; Path=${prefix}${config.secureCookie !== false ? '; Secure' : ''}`, Location: prefix }); res.end(); return;
      }
      if (!authenticated(req.headers.cookie, config.accessToken)) {
        if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html' || (url.pathname === '/login' && !url.search))) loginPage();
        else json(404, { error: 'Not found' });
        return;
      }
      if (url.pathname === '/api/history' || url.pathname.startsWith('/api/history/')) {
        try {
          if (req.headers.origin && req.headers.origin !== `${config.secureCookie !== false ? 'https' : 'http'}://${req.headers.host}`) {json(403,{error:'Invalid origin'});return;}
          if (req.method === 'GET' && url.pathname === '/api/history') {
            if (!store) throw new Error('Unavailable');
            json(200, await store.page({limit:url.searchParams.get('limit')||undefined,cursor:url.searchParams.get('cursor')||undefined,q:url.searchParams.get('q')||'',kind:url.searchParams.get('kind')||undefined})); return;
          }
          if (req.method === 'GET' && url.pathname === '/api/history/changes') { json(200,await store.changes({cursor:url.searchParams.get('cursor')||'0',limit:url.searchParams.get('limit')||undefined}));return; }
          const match = /^\/api\/history\/(conversation|project|artifact)\/([A-Za-z0-9_-]{1,180})$/.exec(url.pathname);
          if (match && req.method==='GET') {if(req.headers.origin && req.headers.origin !== `${config.secureCookie !== false ? 'https' : 'http'}://${req.headers.host}`){json(403,{error:'Invalid origin'});return;}const record=await store.detail(match[1],match[2]);json(record?200:404,record?{record}:{error:'Not found'});return;}
          if (!match || !['PUT','DELETE'].includes(req.method)) { json(404,{error:'Not found'});return; }
          if (req.headers.origin !== `${config.secureCookie !== false ? 'https' : 'http'}://${req.headers.host}`) {json(403,{error:'Invalid origin'});return;}
          if (!String(req.headers['content-type']).startsWith('application/json')) {json(415,{error:'JSON required'});return;}
          const body = await readBody(req);
          if (!body || !Number.isSafeInteger(body.version) || body.version < 0 || (body.importOnly !== undefined && typeof body.importOnly !== 'boolean') || (body.importOnly && (body.version !== 0 || req.method !== 'PUT'))) {json(400,{error:'Invalid history request'});return;}
          const [,kind,id]=match;
          if (!validId(id)) {json(400,{error:'Invalid id'});return;}
          const data = req.method === 'DELETE' ? null : validateRecord(kind,body.data);
          if (data && data.id !== id) {json(400,{error:'Invalid id'});return;}
          if (!store) throw new Error('Unavailable');
          const record = await store.write(kind,id,body.version,data,{importOnly:body.importOnly===true});
          json(record.conflict ? 409 : 200,{record});return;
        } catch(error) {json(error.status || 503,{error:error.status ? error.message : 'History storage unavailable. Retry without closing this page.'});return;}
      }
      if (req.method === 'GET' && url.pathname === '/api/health') { json(200, { ok: true, model: MODEL }); return; }
      if (req.method === 'GET' && url.pathname === '/api/channels') {
        json(200, { channels: [...channels.values()].map(({ id, label, protocol, models }) => ({ id, label, ...(protocol === 'responses' ? { protocol, models } : {}) })), defaultChannel }); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/models') {
        const gptModels = GPT_MODELS.filter(model => [...channels.values()].some(c => c.models?.includes(model)));
        json(200, { profiles: [{ id: 'opus-5', name: 'Claude Opus 5.5', shortName: 'Opus 5.5', description: 'Private API · adaptive thinking · high effort', speed: 'Adaptive', reasoning: 'High', isPro: false, requiresUpgrade: false, supportsThinking: true },
          ...gptModels.map(id => ({ id, name: id === 'gpt-6-astra' ? 'GPT-6 Astra' : 'GPT-6.1 Sol', shortName: id === 'gpt-6-astra' ? 'GPT-6 Astra' : 'GPT-6.1 Sol', description: 'Private API · high reasoning effort', speed: 'Adaptive', reasoning: 'High', isPro: false, requiresUpgrade: false, supportsThinking: true }))] }); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/logout') {
        res.setHeader('Set-Cookie', `chat_session=; HttpOnly; SameSite=Strict; Path=${prefix}; Max-Age=0${config.secureCookie !== false ? '; Secure' : ''}`); json(200, { ok: true }); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/chat') {
        if (req.headers.origin && req.headers.origin !== `${config.secureCookie !== false ? 'https' : 'http'}://${req.headers.host}`) { json(403, { error: 'Invalid origin' }); return; }
        if (active >= 2) { res.setHeader('Retry-After', '5'); json(429, { error: 'Two requests already running' }); return; }
        if (!String(req.headers['content-type']).startsWith('application/json')) { json(415, { error: 'JSON required' }); return; }
        active++;
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), 240000);
        const disconnect = () => { if (!res.writableEnded) abort.abort(); };
        res.on('close', disconnect); req.on('aborted', disconnect);
        const emit = (event, data) => { if (!res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
        try {
          const body = await readBody(req);
          const channelId = body?.channel === undefined ? defaultChannel : body.channel;
          if (typeof channelId !== 'string' || !channels.has(channelId)) bad('Invalid channel');
          const channel = channels.get(channelId);
          const responses = channel.protocol === 'responses';
          if (responses ? !channel.models.includes(body.profile) : body.profile !== undefined && body.profile !== 'opus-5') bad('Invalid model for channel');
          const validated = chatPayload(body, config);
          const payload = responses ? responsesPayload(body, validated) : validated;
          if (abort.signal.aborted) throw new Error('Disconnected');
          const upstream = await fetchUpstream(channel.endpoint, { method: 'POST', headers: responses ? { 'Content-Type': 'application/json', Authorization: `Bearer ${channel.key}`, 'User-Agent': 'curl/8.5.0' } : { 'Content-Type': 'application/json', 'x-api-key': channel.key, Authorization: `Bearer ${channel.key}`, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(payload), signal: abort.signal });
          if (!upstream.ok) { await upstream.body?.cancel(); json(502, { error: `Upstream request failed (${upstream.status})` }); return; }
          res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
          res.flushHeaders();
          const sources = new Set(); let completed = false;
          const citation = c => { if (c?.url && /^https?:\/\//.test(c.url)) sources.add(c.url.replace(/[\r\n]/g, '')); };
          const block = b => {
            if (b?.type === 'text' && b.text) emit('text', { delta: b.text });
            if (b?.type === 'thinking' && b.thinking) emit('thinking', { delta: b.thinking });
            b?.citations?.forEach(citation);
          };
          const responseOutput = (output, render = true) => {
            for (const item of output || []) {
              if (render && item.type === 'reasoning') {
                for (const summary of item.summary || []) if (summary.type === 'summary_text' && typeof summary.text === 'string') emit('thinking', { delta: summary.text });
              }
              for (const part of item.content || []) {
                if (render && part.type === 'output_text' && typeof part.text === 'string') emit('text', { delta: part.text });
                part.annotations?.forEach(citation);
              }
            }
          };
          if (upstream.headers.get('content-type')?.includes('text/event-stream')) {
            for await (const event of sseObjects(upstream.body)) {
              if (responses) {
                if (['error', 'response.failed', 'response.incomplete'].includes(event.type)) throw new Error('Upstream response failed');
                if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') emit('text', { delta: event.delta });
                if (event.type === 'response.reasoning_summary_text.delta' && typeof event.delta === 'string') emit('thinking', { delta: event.delta });
                if (event.type === 'response.output_text.annotation.added') citation(event.annotation);
                if (event.type === 'response.completed') {
                  if (event.response?.status !== 'completed' || event.response.error) throw new Error('Invalid upstream completion');
                  responseOutput(event.response.output, false); completed = true;
                }
                continue;
              }
              if (event.type === 'error') throw new Error('Upstream stream error');
              if (event.type === 'message_stop') completed = true;
              if (event.type === 'content_block_start') block(event.content_block);
              const d = event.delta;
              if (d?.type === 'text_delta') emit('text', { delta: d.text });
              if (d?.type === 'thinking_delta') emit('thinking', { delta: d.thinking });
              if (d?.type === 'citations_delta') citation(d.citation);
            }
          } else {
            const result = await upstream.json();
            if (responses) {
              if (result.status !== 'completed' || result.error || !Array.isArray(result.output)) throw new Error('Invalid upstream response');
              responseOutput(result.output); completed = true;
            } else {
              if (!Array.isArray(result.content) || result.type === 'error') throw new Error('Invalid upstream response');
              result.content.forEach(block); completed = true;
            }
          }
          if (!completed) throw new Error('Incomplete upstream response');
          if (sources.size) emit('text', { delta: '\n\nSources:\n' + [...sources].map((url, i) => `${i + 1}. ${url}`).join('\n') });
          emit('done', {}); res.end();
        } catch (error) {
          if (!res.destroyed) {
            const message = error.status ? error.message : abort.signal.aborted ? 'Request cancelled or timed out' : 'Upstream unavailable or response interrupted';
            if (res.headersSent) { emit('error', { error: message }); res.end(); }
            else json(error.status || 502, { error: message });
          }
        } finally { clearTimeout(timer); abort.abort(); res.off('close', disconnect); req.off('aborted', disconnect); active--; }
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method) || url.pathname.startsWith('/api/') || url.pathname === '/login') { json(404, { error: 'Not found' }); return; }
      // A conversation URL is a single, generated-safe session id. Serve the
      // SPA shell so the client can load that id directly; never fall back for
      // arbitrary paths (which would expose a public file/router surface).
      const isConversationPath = /^\/[A-Za-z0-9_-]{1,180}$/.test(url.pathname);
      const target = staticPath(url.pathname === '/' || isConversationPath ? '/index.html' : url.pathname, dist);
      if (!target) { json(404, { error: 'Not found' }); return; }
      let real;
      try { real = await realpath(target); if (!real.startsWith(await realpath(dist) + path.sep) || !(await stat(real)).isFile()) throw new Error(); } catch { json(404, { error: 'Not found' }); return; }
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' }[path.extname(real)];
      if (!mime) { json(404, { error: 'Not found' }); return; }
      res.writeHead(200, { 'Content-Type': mime }); res.end(req.method === 'HEAD' ? undefined : await readFile(real));
    } catch { if (!res.headersSent) json(500, { error: 'Internal server error' }); else res.end(); }
  });
  if (store && !options.store) server.on('close', () => { void store.close(); });
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config = JSON.parse(await readFile(process.env.RUNTIME_CONFIG || path.join(root, 'runtime.json'), 'utf8'));
    if (!config.database) throw new Error('Database configuration required');
    const server = createChatServer(config);
    server.requestTimeout = 250000; server.headersTimeout = 15000;
    server.listen(3107, '127.0.0.1', () => console.log('Private Opus chat listening on 127.0.0.1:3107'));
  } catch { console.error('Cannot start: check private runtime configuration'); process.exitCode = 1; }
}
