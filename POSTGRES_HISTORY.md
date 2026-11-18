# PostgreSQL 会话持久化

## 部署结构
- 复用 `sub2api-postgres` 容器，独立数据库 `claude_chat`、专用低权限角色 `claude_chat_app`。
- 表：`chat_history.records`，主键 `(kind,id)`，包含 JSONB 数据、版本、删除标记、修改时间。
- 凭据仅在 `runtime.json.database`；禁止输出或打入前端。未增加 PostgreSQL 公网映射。
- 当前使用 Docker 私网地址。容器重建/网络变化后若地址改变，需要更新运行配置中的 database.host 并重启网页服务。
- 一个登录口令对应一个共享工作区，不提供独立用户隔离。设置仍保留在设备本地。

## 迁移和同步
成功读取服务端后，浏览器首次打开自动导入本地 v3 会话、项目和作品；以 ID 去重，服务器已有记录优先，删除标记防止旧设备复活历史。原 localStorage 数据保留，不自动清空；迁移标记为 `claude_pg_migrated_v1`。

所有真正的用户旧记录只能在用户原浏览器打开网页后迁移；服务器不能读取远端浏览器存储。同 ID 的旧副本不会覆盖服务端，旧版本仍留在原浏览器；页面按用户要求不提供常驻同步状态或导出按钮。

逐条版本检查防止覆盖其他设备；冲突编辑保存为新副本，过期删除取消。闲置页面每 30 秒/重新聚焦刷新，流式期间避免覆盖正在生成的内容，生成结束立即保存。

保存失败会保留页面内存并提示重试；正常时无常驻提示。**未保存成功的修改在强制关闭/刷新后可能丢失**。单条记录限制 9MiB。

## 按需加载
- 首屏混合会话、项目、作品最多30条摘要，不返回消息、附件、指令或作品内容；通过“加载更多历史”继续取摘要页。标题搜索在服务端分页查询，不扫描消息全文。
- 会话点击后读取该条完整正文；已打开会话在浏览器内缓存。本版不是单条会话内部消息分页。项目和作品也按需读取详情；发送前确保项目指令/文件已加载。未打开记录的重命名先获取详情再合并，避免丢失正文。
- 后台每次最多100条增量摘要，通过事务内串行 change_clock 分配的 seq 游标推进；脏记录/生成中的变更延后重放。changes 表保存变更摘要，不存正文；当前未增加日志自动清理，后续增长需考虑保留策略与游标过期重置。
- 新增 chat_history.change_clock、changes、lazy_change trigger 与摘要排序索引，原 records 及正文无破坏性修改。
- 本次上线前代码+完整数据库备份：/root/.hermes/backups/claude-before-lazy-20261017-154304；正式站部署前后原记录指纹一致。

## 会话独立链接
- 点击历史会话更新地址为 `/claude/<conversation_id>`；直接打开、刷新、前进/后退按 ID 读取正文，不要求该条摘要在首屏。
- 新会话发送首条消息后分配链接；不存在/已删除会话显示加载失败，不会自动打开其他历史。
- 服务端仅允许安全的单段会话路径回退到 SPA，仍要求原有登录 Cookie。未登录深链、站点根路径保持 404。
- 会话路由回归包含在 `server/history-lazy.e2e.mjs` 和 `server/local.test.mjs`。

## 验证
```sh
node --test server/history*.test.mjs server/local.test.mjs server/time-context.test.mjs server/theme.test.mjs
NODE_OPTIONS=--max-old-space-size=384 npm run build -- --outDir dist.lazy-staging
RUN_BROWSER_TEST=1 TEST_DIST=dist.lazy-staging node --test --test-concurrency=1 server/history-lazy.e2e.mjs server/history.e2e.mjs server/history-quiet.e2e.mjs
RUN_BROWSER_TEST=1 TEST_BASE_URL=http://127.0.0.1:3108/ node --test server/mobile-navigation.e2e.mjs
```
浏览器集成测试使用独立 `history_test_*` schema，仅删除自己生成的测试 schema，不调用付费模型。

## 备份与回滚
修改前源码、构建、运行配置备份：`/root/.hermes/backups/claude-postgres-20261017-103539`（含凭据，仅限管理员访问）。旧线上构建为 `dist.before-postgres`。

数据库应定期备份；本次未创建自动备份任务。手工备份示例（输出仅管理员可读）：
```sh
umask 077
docker exec sub2api-postgres pg_dump -U sub2api -d claude_chat -Fc > /root/claude-chat-backup.dump
```
不要对 sub2api 数据库执行聊天库迁移或清理。回滚应用不应删除 `claude_chat`，否则服务器新增历史会丢失。旧版仅看到其保留的本地历史，回滚前应导出服务器新增会话。
