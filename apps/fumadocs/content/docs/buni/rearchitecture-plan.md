---
title: "Buni V2 重构方案"
---

# Buni V2 重构方案

## 1. 已确认的技术决策

当前方案不再走“本地优先单体 App”路线，直接走服务化架构。

已确认：

- 客户端：
  - Tauri
  - React
  - TanStack AI
  - TanStack Router
  - TanStack Query
  - TanStack Form
  - Tailwind CSS
  - shadcn/ui
  - Zod
- 服务端：
  - Bun workspace
  - Hono
  - TanStack AI
  - Drizzle ORM
  - SQLite
  - Zod
- SQLite 放在服务端，不放在客户端
- 每个用户自托管一个 Hono 服务
- 服务端负责：
  - API
  - 持久化
  - 任务调度
  - 记忆
  - 主动消息
  - 各种配置管理
- 服务端使用 Hono RPC、`@hono/zod-validator` 等能力组织 API
- 服务端和客户端都使用 TanStack AI
- 客户端不承载核心服务逻辑，只负责 UI、设备桥接和交互

这意味着：

- 客户端是“客户端”
- 服务端是“系统中枢”
- 后续多端同步、主动能力、任务调度、未来多用户都围绕服务端展开

## 1.1 当前实现进度

当前仓库已经落地的内容：

- Bun workspace monorepo 骨架已经建立
- `apps/server` 已接入：
  - Hono
  - Drizzle
  - SQLite
  - Zod 校验
  - Hono RPC 类型导出
- `apps/mobile` 已接入：
  - React
  - TanStack Router
  - TanStack Query
  - TanStack Form
  - Tailwind CSS
- 基础资源已经可用：
  - `health`
  - `config`
  - `conversations`
  - `messages`
  - `schedules`
  - `events`
- TanStack AI 主链已经打通第一版：
  - 服务端 `/v1/chat/stream` 现在是标准 TanStack AI SSE
  - 服务端使用 mock text adapter 产出 AG-UI stream chunks
  - 移动端已经接入 `useChat + fetchServerSentEvents`
  - 服务端 tools / 客户端 tools 注册位已经接好
- provider 配置第一版已经落地：
  - `provider_configs` 数据表已经建立
  - `/v1/config/provider` 已可读写
  - 服务端已经有 provider -> adapter factory
  - 当前已接入 `mock` 和 `openai`

当前还没有完成的部分：

- provider 级别的多实现扩展
- 真正的 server tool 自动执行闭环
- client tool 回传后的多轮 continuation
- chat 与 conversations/messages 的持久化打通
- WebSocket 实时同步
- provider / feature 配置表

建议把当前状态理解为：

- 工程骨架已可持续扩展
- typed API 已形成
- chat streaming 主路径已成立
- 下一步重点是“把 mock AI 替换成真实 provider”，而不是继续推翻结构

## 2. 产品边界

这个产品不是普通聊天 App，而是一个“AI 陪伴系统”。

一期要保住的产品价值：

- 对话
- 长期记忆
- 配置
- 提醒 / 日程
- AI 主动消息
- 多端同步基础能力

一期明确不做：

- BLE
- 后台语音唤醒
- 自动摄像头轮询监控
- 持续定位状态机
- 手机活动日志采集
- 多用户账号系统

说明：

- 以后可以加用户体系，但一期不应为 auth / billing / tenant 增加复杂度
- 数据模型会按“未来可多用户”方式设计，但运行时先单用户

## 2.1 部署模型

当前确认的部署模型是：

- 每个用户自行部署一个服务端实例
- Tauri 移动端 / 桌面端连接自己的 Hono 服务
- 当前阶段是私有产品，不做中心化托管

这意味着一期可以不做：

- 完整账号系统
- 中央鉴权
- 多租户隔离
- SaaS 运维体系

但仍然建议保留：

- `profiles` / `devices` 这样的基础抽象
- 服务端地址配置
- API token / 局域网访问控制

## 3. 推荐总架构

```text
Tauri Mobile/Desktop Client
  └── React App
      └── 调用 Hono API

Hono Server
  ├── REST API
  ├── SSE / WebSocket 实时通道
  ├── Hono RPC Surface
  ├── Scheduler / Jobs
  ├── Memory Pipeline
  ├── TanStack AI Tool Runtime
  ├── Provider Integrations
  └── Config / Event Store

SQLite
  ├── Conversations
  ├── Messages
  ├── Memories
  ├── Schedules
  ├── Jobs
  ├── Events
  └── Config Tables
```

核心原则：

- 业务逻辑只进服务端
- 客户端只保留表现层和少量设备能力
- 所有结构化输入输出用 Zod 定义
- 所有数据库访问通过 Drizzle schema + repo 层

## 3.1 AI 运行模型

TanStack AI 作为双端统一的 AI 运行时。

推荐分工：

- 服务端：
  - 定义共享 tool definitions
  - 实现 server tools
  - 调用 LLM
  - 产出流式响应
  - 将 tool 调用结果写入会话和事件流
- 客户端：
  - 实现 client tools
  - 消费 TanStack AI 流
  - 执行 UI / 设备相关工具
  - 把 client tool 结果回传服务端

这套模式非常适合你的产品，因为 TanStack AI 原生支持：

- 类型安全工具定义
- 流式输出
- server tools
- client tools
- client/server 分环境实现

## 4. 为什么这条路线比“移动端跑后端”更合适

### 4.1 你要的是长期演进，不是下载即单机

你已经明确：

- 不想把服务端逻辑放在本地
- SQLite 在 Hono 服务端
- Bun workspace 做统一工程组织

那就意味着你已经优先选择了：

- 清晰边界
- 更好的可维护性
- 更好的任务编排
- 更好的同步模型

这对这个产品是对的。

### 4.2 真正值钱的能力都更适合放服务端

这些能力天然更像服务端能力：

- 记忆提炼
- 记忆召回
- provider 配置
- 主动消息
- 定时任务
- 事件审计
- 未来多端同步

如果这些东西塞进客户端，后面一定会拆。

### 4.3 Tauri 客户端应该聚焦在“体验层”

客户端重点应是：

- 聊天体验
- 设置体验
- 记忆管理
- 日程管理
- 通知入口
- 少量平台桥接

而不是承担：

- 编排中心
- 状态权威源
- 持久化核心

## 5. 工程结构

采用 Bun workspace。

建议结构：

```text
apps/
  mobile/
    src/
    src-tauri/
    package.json

  server/
    src/
      app/
      routes/
      middleware/
      jobs/
      services/
      repos/
      providers/
      realtime/
      lib/
    package.json

packages/
  contracts/
    src/
      common/
      config/
      conversations/
      memories/
      schedules/
      events/
    package.json

  db/
    src/
      schema/
      client/
      repos/
    drizzle.config.ts
    package.json

  core/
    src/
      prompts/
      memory/
      scheduler/
      orchestration/
      domain/
    package.json

  ui/
    src/
      components/
      forms/
      layout/
    package.json
```

## 6. 分层职责

## 6.1 `apps/server`

职责：

- Hono app
- 路由注册
- 中间件
- 任务入口
- WebSocket / SSE
- 配置和服务装配
- TanStack AI server tools 注册
- Hono RPC app type 导出

不做：

- 复杂领域逻辑直接写在 route handler 里

## 6.2 `packages/contracts`

职责：

- Zod schema
- request / response DTO
- event payload
- shared enums / literals
- shared tool definitions

原则：

- 所有 API 契约都来自这里
- 前端 form schema 尽量复用这里的 schema

## 6.3 `packages/db`

职责：

- Drizzle schema
- migration
- db client
- repositories

原则：

- 不在 route 里直接手写 SQL
- repo 层只做数据访问，不写编排逻辑

## 6.4 `packages/core`

职责：

- prompt assembly
- memory digest / recall
- schedule execution rules
- active messaging rules
- event transformation
- AI orchestration
- tool routing rules

原则：

- 不依赖 Hono
- 不依赖 React
- 可以被 server 直接复用

## 6.5 `apps/mobile`

职责：

- 页面
- 表单
- API client
- UI 状态
- 调用 Tauri 原生桥
- TanStack AI client tools
- 流式聊天消费

原则：

- 不把业务规则写进组件
- 不直接操作持久化核心数据

## 7. 数据模型草案

一期虽然单用户，但 schema 要能平滑升级到多用户。

## 7.1 核心身份表

### `profiles`

- `id`
- `name`
- `created_at`
- `updated_at`

说明：

- 一期只有一个默认 profile
- 以后扩到多用户时不推翻表结构

### `devices`

- `id`
- `profile_id`
- `platform`
- `name`
- `push_token`
- `last_seen_at`
- `created_at`
- `updated_at`

## 7.2 配置表

### `provider_configs`

- `id`
- `profile_id`
- `provider`
- `encrypted_secret`
- `base_url`
- `model_defaults_json`
- `created_at`
- `updated_at`

### `agent_configs`

- `id`
- `profile_id`
- `ai_name`
- `user_name`
- `ai_persona`
- `user_persona`
- `system_preferences_json`
- `created_at`
- `updated_at`

### `feature_configs`

- `id`
- `profile_id`
- `key`
- `value_json`
- `created_at`
- `updated_at`

## 7.3 聊天和记忆

### `conversations`

- `id`
- `profile_id`
- `title`
- `model_key`
- `status`
- `created_at`
- `updated_at`

### `messages`

- `id`
- `conversation_id`
- `role`
- `kind`
- `content`
- `metadata_json`
- `created_at`

说明：

- `role`: user / assistant / system / tool
- `kind`: text / generated / reminder / event / tool_result

### `attachments`

- `id`
- `message_id`
- `type`
- `path`
- `mime_type`
- `size`
- `created_at`

### `memories`

- `id`
- `profile_id`
- `content`
- `keywords_json`
- `importance`
- `status`
- `source_type`
- `embedding_ref`
- `created_at`
- `updated_at`

说明：

- 一期可以先不把 embedding 直接塞 SQLite BLOB
- 可先保留 `embedding_ref` 或 JSON 文本，后面再优化

### `memory_sources`

- `id`
- `memory_id`
- `conversation_id`
- `message_start_id`
- `message_end_id`
- `created_at`

## 7.4 提醒和任务

### `schedules`

- `id`
- `profile_id`
- `type`
- `title`
- `content`
- `trigger_at`
- `cron_expr`
- `timezone`
- `status`
- `metadata_json`
- `created_at`
- `updated_at`

### `jobs`

- `id`
- `type`
- `payload_json`
- `run_at`
- `status`
- `attempts`
- `last_error`
- `created_at`
- `updated_at`

## 7.5 事件和同步

### `events`

- `id`
- `profile_id`
- `type`
- `payload_json`
- `created_at`

用途：

- WebSocket 同步
- 调试
- 审计
- 主动消息追踪

## 8. API 设计草案

版本化前缀：

- `/v1/*`

建议把服务端拆成三层接口：

- `RPC API`
  - 配置
  - CRUD
  - 普通查询
- `Streaming API`
  - 聊天流
  - AI continuation
- `Realtime API`
  - WebSocket 事件广播

不要试图把所有东西都塞进 Hono RPC。

RPC 很适合：

- typed config endpoints
- conversations/messages CRUD
- memories CRUD
- schedules CRUD

但聊天流式输出和实时同步应该独立出来。

## 8.1 配置

- `GET /v1/config/providers`
- `PUT /v1/config/providers/:provider`
- `GET /v1/config/agent`
- `PUT /v1/config/agent`
- `GET /v1/config/features`
- `PUT /v1/config/features/:key`

## 8.2 对话

- `GET /v1/conversations`
- `POST /v1/conversations`
- `GET /v1/conversations/:id`
- `PATCH /v1/conversations/:id`
- `DELETE /v1/conversations/:id`

## 8.3 消息

- `GET /v1/conversations/:id/messages`
- `POST /v1/conversations/:id/messages`
- `POST /v1/conversations/:id/messages/stream`
- `PATCH /v1/messages/:id`
- `DELETE /v1/messages/:id`

说明：

- 流式回复建议走 SSE
- 同步事件建议走 WebSocket
- 普通 CRUD 可走 Hono RPC client

## 8.4 记忆

- `GET /v1/memories`
- `POST /v1/memories/digest`
- `POST /v1/memories/recall`
- `PATCH /v1/memories/:id`
- `DELETE /v1/memories/:id`

## 8.5 日程

- `GET /v1/schedules`
- `POST /v1/schedules`
- `PATCH /v1/schedules/:id`
- `DELETE /v1/schedules/:id`

## 8.6 实时和系统

- `GET /v1/events`
- `GET /v1/realtime/sse`
- `GET /v1/realtime/ws`
- `GET /v1/health`

## 8.7 API 开发规范

建议统一：

- 输入校验：`@hono/zod-validator`
- 返回结构：`c.json(...)`
- 导出 `AppType`
- 客户端通过 `hc<AppType>()` 访问 RPC 路由

说明：

- Hono RPC 基于导出的 `AppType` 和 validator 类型推断
- 在 monorepo 中，客户端和服务端的 tsconfig 都需要 `strict: true`

## 9. 前端路由

使用 `@tanstack/router-plugin/vite` file-based routing，路由树自动生成（`routeTree.gen.ts` 不提交）。

`_app` pathless layout 承载底部 Tab 导航，URL 保持干净。

```text
src/routes/
  __root.tsx                        # 全局根布局（QueryClientProvider、主题）
  index.tsx                         # / → redirect /chat
  _app.tsx                          # Pathless layout：底部 Tab 导航栏
  _app.chat.tsx                     # /chat
  _app.chat.$conversationId.tsx     # /chat/$conversationId
  _app.memories.tsx                 # /memories
  _app.schedules.tsx                # /schedules
  _app.settings.tsx                 # /settings
  _app.settings.providers.tsx       # /settings/providers
  _app.settings.agent.tsx           # /settings/agent
```

**vite.config.ts**：`tanstackRouter({ target: 'react', autoCodeSplitting: true })` 必须在 `react()` 之前。

## 10. 客户端信息架构

一期页面只保留四个主页面：

- Chat
- Memories
- Schedules
- Settings

### Chat

包含：

- 会话列表
- 消息流
- 发送框
- 模型切换
- 流式状态
- 工具执行状态
- client tool 回调结果展示

### Memories

包含：

- 记忆列表
- 搜索
- 编辑
- 手动总结触发

### Schedules

包含：

- 提醒列表
- 新建提醒
- 编辑 / 删除
- 触发记录

### Settings

包含：

- provider keys
- model defaults
- AI persona
- user persona
- feature flags

## 11. 一期实现路径

## Milestone 0：工程底座

- Bun workspace
- apps/server
- apps/mobile
- packages/contracts
- packages/db
- packages/core
- packages/ui

输出标准：

- monorepo 跑起来
- 类型共享生效
- lint / build / dev 命令可用

## Milestone 1：配置中心

- provider config schema
- agent config schema
- settings API
- settings 页

输出标准：

- 可以配置模型
- 可以配置 AI / 用户人设
- 配置持久化到 SQLite

## Milestone 2：聊天闭环

- conversations API
- messages API
- stream endpoint
- prompt assembly
- 客户端聊天页
- TanStack AI 基础接入
- server tools / client tools 最小闭环

输出标准：

- 创建对话
- 发送消息
- 流式回复
- 持久化消息
- 支持至少一个 server tool 和一个 client tool

## Milestone 3：记忆闭环

- digest pipeline
- memory CRUD
- recall pipeline
- memory 管理页

输出标准：

- 可以生成记忆
- 可以编辑记忆
- 聊天时能召回记忆

## Milestone 4：提醒和主动消息

- schedules API
- jobs 执行器
- 本地/远程通知桥
- AI 主动消息逻辑

输出标准：

- 到点触发提醒
- AI 能主动发送消息
- 客户端能收到通知和同步

## Milestone 5：多端同步基础

- WebSocket 事件通道
- conversations/messages/events 同步
- reconnect 策略

输出标准：

- 同一账号多端在线时状态基本一致

## 11.1 TanStack AI 工具策略

一期明确分两类工具：

### Server tools

放服务端执行：

- 查询记忆
- 写入记忆
- 创建提醒
- 修改设置
- 查询会话
- provider 相关调用

### Client tools

放客户端执行：

- 打开页面
- 本地通知展示
- 复制文本
- 调起文件选择
- 调起设备能力

原则：

- 只要涉及数据库、密钥、任务、会话权威状态，就必须是 server tool
- 只要涉及 UI、本地设备、交互反馈，就应该是 client tool

## 12. 一期不建议碰的坑

这些内容先不要进入主路径：

- BLE
- 摄像头自动后台监控
- 背景语音唤醒
- 长时间定位状态机
- 活动日志持续采集
- 复杂 auth
- 多租户

原因：

- 技术成本高
- 平台差异大
- 很容易吞掉主线开发时间

## 13. 关键工程建议

### 13.1 流式生成只用一种主路径

建议：

- 回复流：SSE
- 实时同步：WebSocket

不要一开始搞很多传输通道。

补充：

- TanStack AI 负责流式 chunk 协议和 tool 调用编排
- Hono 负责把流包装成 HTTP Response

### 13.2 配置必须 schema-first

所有配置：

- 先写 Zod schema
- 再写 Drizzle 表
- 再写 API
- 最后写 Form

### 13.3 业务规则必须服务端权威

不要把这些判断放客户端：

- 哪些消息进上下文
- 记忆如何召回
- 提醒何时触发
- 主动消息是否发送

### 13.4 事件留痕

主动消息、提醒、系统触发都要写 `events` 表。

否则以后你会很难 debug：

- 为什么 AI 主动说话了
- 为什么提醒没发出来
- 为什么某个状态不同步

### 13.5 Hono RPC 的边界要克制

Hono RPC 非常适合这个项目，但只应该覆盖“类型稳定的业务接口”。

建议覆盖：

- config
- conversations
- messages CRUD
- memories CRUD
- schedules CRUD
- health

不要强行覆盖：

- SSE streaming
- WebSocket
- 大文件上传分片
- 复杂长连接状态

## 13.6 OpenAPI 和 `/llms.txt`

建议在服务端保留 API 文档输出能力。

可以考虑：

- 用 Hono 的 OpenAPI 生态输出 `/doc`
- 再生成一份 `/llms.txt`

这样做的价值不是给最终用户，而是：

- 方便 AI coding agents 理解 API
- 方便以后自动生成客户端或工具说明
- 方便私有部署时调试

## 14. 下一步可直接开工的内容

下一阶段应该直接产出：

1. Bun workspace 根目录结构
2. Drizzle schema 初稿
3. contracts 的 Zod schema
4. Hono 路由清单细化
5. 聊天 / 设置 / 记忆 / 日程四个页面的信息架构

## 15. 当前结论

你的当前路线已经足够清晰：

- 不做本地服务端
- 直接做 Hono 服务
- SQLite 在服务端
- Tauri 只做客户端
- Bun workspace 做 monorepo

这条路线比“移动端假装跑后端”更清楚，也更符合这个产品后续会变复杂的事实。

接下来最应该做的不是继续讨论方向，而是把：

- schema
- API
- monorepo
- 页面结构

一次性定下来。
