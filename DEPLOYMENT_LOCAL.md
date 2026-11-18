# 本机私有 Opus 聊天部署

## 构建与启动

需要 Node.js 22+。生产服务为无额外依赖的 `server/local.mjs`，**不要使用 Vite dev/preview 或旧 server/apiMiddleware.ts 作为生产 API**。

```sh
cd /home/code_room/claude-ui-clone
npm ci --ignore-scripts
NODE_OPTIONS=--max-old-space-size=384 npm run build
npm test
node server/local.mjs
```

固定监听 `127.0.0.1:3107`，不会开放公网监听。不读取 `.env`，不输出密钥。可用 `RUNTIME_CONFIG=/absolute/private/runtime.json` 指定配置位置，默认读取仓库根目录 `runtime.json`。配置文件必须由部署者创建并限制权限（例如 chmod 600）；已 gitignore，不会写入浏览器 bundle。

## 私有运行配置（示例，不是真实凭据）

```json
{
  "endpoint": "https://YOUR-PROVIDER.example/v1/messages",
  "key": "YOUR-SERVER-ONLY-API-KEY",
  "accessToken": "REPLACE_WITH_AT_LEAST_32_RANDOM_URL_SAFE_CHARACTERS",
  "model": "claude-opus-5-5",
  "publicPath": "/claude-RANDOM-SECRET/",
  "webSearch": true,
  "secureCookie": true
}
```

- accessToken 必须为 32–256 位 URL-safe 字符（字母、数字、`_`、`-`）。不要公开分享登录 URL。
- publicPath 必须以 `/` 开始并结束，路径段仅允许字母、数字、`_`、`-`。该值同时决定登录重定向和 Cookie Path。
- endpoint 接受完整 Anthropic Messages URL，也接受站点根 URL 或 `/v1` 基址（自动补 `/v1/messages` 或 `/messages`）。必须提供支持 Anthropic Messages、adaptive thinking / high effort 的服务商。
- 固定模型 `claude-opus-5-5`，客户端 profile、modelOverride 均不能改变实际模型。
- webSearch 默认 true，发送 `web_search_20260209` 工具；提供商不支持时由管理员设置 false。**不会自动重试付费请求**。
- secureCookie 默认 true，外部必须使用 HTTPS。仅在本地 HTTP 调试时可设为 false。

## 反向代理契约

Nginx 在随机路径前缀下反代，并剥除此前缀；例如外部 `/claude-RANDOM-SECRET/api/chat` 转发为 Node `/api/chat`。确保前缀根路径补尾斜杠，否则相对资源/API URL 会错误解析。构建使用 Vite `base: './'`，浏览器 API 使用 `import.meta.env.BASE_URL` 相对 URL。

建议 location 核心设置（由部署者配置，本任务未改动 nginx/systemd）：

```nginx
location /claude-RANDOM-SECRET/ {
    proxy_pass http://127.0.0.1:3107/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 250s;
    client_max_body_size 10m;
    access_log off;
}
```

登录：访问外部 `https://HOST/claude-RANDOM-SECRET/login?token=ACCESS_TOKEN`。Node 验证后设置 `HttpOnly; SameSite=Strict; Secure; Path=/claude-RANDOM-SECRET/` Cookie，303 重定向到前缀根路径（移除查询 token）。**不要记录登录查询串**；代理日志/历史/书签也可能包含 token。所有其他路由，包括静态文件和 health/models，缺少或无效 Cookie 均 404。真实安全边界为服务端 Cookie，前端固定私有显示用户不承担鉴权。

## 能力与边界

- 支持 Anthropic SSE 文本/思考流和 JSON 非流式兼容返回，翻译为前端 text/thinking/done/error。引用 URL 可附加为 Sources。
- 每次请求总时限 240 秒，断开连接取消上游，并发最多 2，超出返回 429。JSON 请求体最多 10MiB（超出 413），最多 200 条消息，总文本上下文 500,000 字符，system 32,000 字符，单条消息/文本附件 200,000 字符。
- 只允许 user/assistant 消息，system 通过 systemPrompt 单独传递；附件支持 base64 PNG/JPEG/GIF/WebP、PDF 和 text/* / JSON / XML 文本，不接受远程附件 URL。
- 不对第三方同步数据；Supabase 完全禁用；移除了页面外部字体/CDN 样式依赖。KaTeX 样式与字体本地打包。CSP 禁止外部 connect/img 等默认访问。
- 不使用 rehype-raw。生成 artifact 的 iframe 严格 sandbox，不允许脚本/同源/表单/弹窗；交互式 React 预览因此禁用，可使用代码视图。此取舍防止模型输出访问已登录 API。
- Claude Code、终端/GitHub/PR、付费升级界面不可操作。保留普通聊天、附件、本地会话和原界面布局。部分继承设置只是本地 UI，不代表提供真实后台服务。
- 对话和设置保存在当前浏览器 localStorage，不做云端同步；**同源不同路径不是 localStorage 隔离边界**。服务器重启不会保存聊天记录；上游提供商仍会收到发送的对话内容。
- 只提供 dist 内允许的静态扩展名，不提供 `.env`、runtime.json、源码、source map 或 dist 外的符号链接文件。

## 验证

`npm test` 使用 Node 内置测试和注入的 mock upstream；只监听临时本地端口，不调用外部或产生 API 费用。覆盖认证、路径、附件/上下文校验、SSE 分片 UTF-8、固定模型、JSON fallback、错误脱敏、10MiB 限制、并发 2 和断开取消。部署后先测试带 Cookie 的 `/api/health`，这是本地健康检查，**不会请求模型服务商**。实际 Opus 端到端回复必须经部署者授权后单独验证，构建和 mock 测试并不能验证服务商是否支持该模型/工具。
