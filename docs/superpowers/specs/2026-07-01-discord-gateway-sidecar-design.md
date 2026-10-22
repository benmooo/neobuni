---
title: "Buni Discord Gateway Sidecar 设计稿"
---

# Buni Discord Gateway Sidecar 设计稿

> 状态：implemented
> 日期：2026-07-01
> 相关文档：
>
> - [2026-06-15-discord-telegram-personal-messaging-design.md](./2026-06-15-discord-telegram-personal-messaging-design.md)
> - [../plans/2026-07-01-discord-telegram-design-alignment.md](../plans/2026-07-01-discord-telegram-design-alignment.md)
> - [../../../apps/server/src/integrations/discord-gateway-normalize.ts](../../../apps/server/src/integrations/discord-gateway-normalize.ts)
> - [../../../apps/server/src/integrations/discord-inbound.ts](../../../apps/server/src/integrations/discord-inbound.ts)
> - [../../../apps/server/src/routes/integrations-discord.ts](../../../apps/server/src/routes/integrations-discord.ts)
> - [../../../apps/server/src/routes/integrations-discord-internal.ts](../../../apps/server/src/routes/integrations-discord-internal.ts)
> - [../../../apps/server/src/sidecars/discord-gateway/index.ts](../../../apps/server/src/sidecars/discord-gateway/index.ts)
> - [../../../apps/server/src/runtime/run-external-message-turn.ts](../../../apps/server/src/runtime/run-external-message-turn.ts)

## 0. 目的

本文定义 Buni 当前 Discord Gateway 能力从“主服务内嵌 worker”演进为“独立 sidecar 进程”的目标设计。

这次要解决的不是：

- 重做 Discord messaging runtime
- 修改 personal-mode / public-safe 的产品边界
- 一次性解决所有 Discord ingress 形态

这次要解决的是：

- 把 Discord gateway websocket 生命周期从主服务进程中拆出来
- 让 `@buni` mention 和 reply-to-bot 可以通过独立 sidecar 运行
- 保持现有 `public_safe` runtime、hidden conversation、dedupe 与 delivery 逻辑可复用
- 为后续的 production deployment、可观测性和配置热更新打好边界

## 1. 背景与现状

## 1.1 当前实现已经有 Discord gateway，但不是 sidecar

当前仓库在设计时的起点已经实现了 Discord gateway 入站能力：

- 旧的单体 `discord-gateway.ts`
  - 负责 `MESSAGE_CREATE` 解析
  - 负责 dedupe / conversation binding / runtime 执行 / send reply
  - 负责 websocket 建连、heartbeat、reconnect
- [index.ts](../../../apps/server/src/index.ts)
  - 服务启动时直接调用 `startDiscordGatewayWorkers()`
- [integrations-discord.ts](../../../apps/server/src/routes/integrations-discord.ts)
  - 处理 Discord interactions webhook / slash command

因此当前形态是：

```text
main server process
  -> HTTP routes
  -> schedule worker
  -> reflection scheduler
  -> task-run worker
  -> Discord gateway worker
```

这满足了“最小可用 gateway worker”，但不满足“独立 sidecar”。

## 1.2 当前实现的主要问题

### 1.2.1 进程边界错误

gateway websocket 是长连接、长期状态、持续重连型能力。

主服务的核心职责则是：

- API request / response
- runtime orchestration
- config CRUD
- webhook ingress

把二者放在同一进程里，会让：

- server restart 同时中断 API 与 gateway 会话
- gateway reconnect/状态噪音污染主服务生命周期
- 后续独立部署与观测都比较别扭

### 1.2.2 模块职责混杂

设计启动时的单体 `discord-gateway.ts` 同时承担了三类职责：

- 纯消息归一化
- DB + runtime + outbound side effects
- websocket session transport

这违背了当前仓库希望遵守的 `functional core, imperative shell` 边界。

### 1.2.3 启动模型是一锤子买卖

`startDiscordGatewayWorkers()` 当前只在启动时：

- `listActiveProfiles()`
- 对每个 profile 读取一次 Discord config
- 为 enabled profile 启动一次 session

这意味着：

- 用户在服务运行中修改 Discord 配置，sidecar 不会自动收敛
- profile 被禁用、token 被替换、appId 变化，都需要重启服务

### 1.2.4 现状没有真正回答“本地运行”的部署问题

对于 mention / reply-to-bot，Discord gateway 是 outbound websocket，理论上可以服务本地运行的 Buni。

但当前实现仍然把 gateway 挂在主服务上，这意味着：

- 本地开发和生产都必须把 gateway 跟 server 绑在一起
- 不能单独拉起、重启、观察 gateway
- 不能清楚表达“server 是 API 进程，gateway 是 sidecar 进程”

### 1.2.5 slash command 仍然依赖公网 ingress

这一点需要明确：

- `@buni` mention / reply-to-bot 可以通过 gateway sidecar 解决本地运行问题
- `/buni` slash command 仍然依赖 Discord interactions webhook

也就是说，sidecar 不是 slash command relay。

## 2. 设计目标

本次设计必须满足：

- 采用真正的独立 sidecar 进程，而不是继续把 gateway 跑在主服务里
- sidecar 只负责 gateway session 生命周期与 mention/reply ingress
- 复用现有 `runExternalMessageTurn(...)` 和 `chat_public_safe` 路径
- 复用现有 `external_event_receipts` 与 `external_conversation_bindings`
- 让配置变化可以在运行时自动收敛
- 让模块边界更符合纯函数 + side effects 隔离的风格

## 3. 非目标

本设计当前不做：

- 把 slash command 也改造成 sidecar-only 入口
- 引入消息队列、任务总线或独立 RPC 服务
- 支持多 sidecar 实例抢占同一 profile 的分布式协调
- 重做 Telegram ingress
- 重做 receipt schema 以支持 crash 后的精确重放

其中最后一点需要特别说明：

当前 receipt 语义是“先去重，再执行”。

这意味着如果进程在 receipt 写入后、回复发送前崩溃，事件可能丢失且不会自动 replay。这个问题当前已经存在，本设计先不扩大范围处理，只在风险里明确记录。

## 4. 备选方案

## 4.1 方案 A：继续保留主服务内嵌 worker

做法：

- 保留当前 `discord-gateway.ts`
- 在 server 里补一个更强的 reconcile loop
- 增加 health log 和 stop/start 控制

优点：

- 改动最小
- 不需要额外的启动脚本

缺点：

- 仍然不是 sidecar
- 生命周期仍然和主服务耦合
- 结构上继续放大 `discord-gateway.ts` 的职责混杂问题

结论：

- 不采用

## 4.2 方案 B：同仓独立进程 sidecar，直接调用共享 runtime 服务

做法：

- 在 `apps/server` 内增加独立 entrypoint
- sidecar 直接 import 共享的 inbound runtime 服务
- 主服务保留 HTTP routes；sidecar 保留 gateway websocket

优点：

- 真正具备 sidecar 进程边界
- 复用现有 runtime 与 DB 边界，改动成本适中
- 不需要额外 internal API
- demo 和最小落地速度最快

缺点：

- sidecar 会变成第二个 runtime host，而不是纯 transport adapter
- `@buni` 链路下 runtime ownership 不再唯一归属 server
- sidecar 同时拥有 ingress 和 runtime，边界不够干净
- 未来若要跨主机拆分，仍然需要补 internal API

结论：

- 作为战术备选，不作为目标架构

## 4.3 方案 C：独立 sidecar + internal HTTP

做法：

- gateway sidecar 只接收并归一化 Discord 事件
- 通过 localhost internal HTTP 将归一化后的 inbound prompt 投递到 server
- server 负责 runtime 执行与最终的 Discord 出站发送

优点：

- server 保持唯一 runtime owner
- sidecar 只做 transport / ingress adapter，边界最清楚
- 未来扩展到 cloud sidecar、public relay、Telegram sidecar 都更顺
- 便于日志、trace 和故障归因统一落在 server runtime 边界

缺点：

- 需要新增 internal route、认证和本地 HTTP client
- 相比 direct reuse 多一次 localhost hop

结论：

- 推荐采用

## 5. 核心决策

## 5.1 采用“同仓独立进程 sidecar”而不是“新 workspace app”

Phase 1 先不创建新的 workspace package。

采用：

```text
apps/server/src/sidecars/discord-gateway/index.ts
```

作为独立进程入口。

理由：

- 现在主要目标是获得真实进程边界，而不是包发布边界
- 共享 `@buni/db`、runtime、integrations 代码会更直接
- 对本地开发和现有脚本体系影响更小

如果未来需要单独发布 Docker image 或独立部署，再把它提升为单独 app/package。

## 5.2 采用“internal HTTP”，保持 server 为唯一 runtime owner

sidecar 在 v1 里不直接调用 `runExternalMessageTurn(...)`，而是只负责：

- 接收 Discord gateway 事件
- 做 filter / normalize
- 调用 internal HTTP route

server 负责：

- receipt dedupe
- external conversation binding
- `runExternalMessageTurn(...)`
- `sendDiscordMessage(...)`

采用：

- `POST /internal/integrations/discord/inbound-message`

不采用：

- sidecar 直接 import 共享 inbound runtime 并执行
- queue enqueue/dequeue

理由：

- sidecar 保持为纯 ingress adapter
- server 保持为唯一 runtime 与 egress owner
- ownership 更清晰，也更符合长期架构

## 5.3 sidecar 的 Gateway transport 采用 `discord.js`

本设计明确采用 `discord.js` 作为 sidecar 的 Discord Gateway client 实现。

理由：

- 它是 Node / TypeScript 生态里最成熟、最常见的 Discord bot 选择
- 可以去掉手写 HELLO / IDENTIFY / heartbeat / reconnect 样板代码
- 能让 sidecar 聚焦在 event filter、normalize、reconcile 与 internal relay

边界要求：

- `discord.js` 只允许出现在 sidecar transport adapter 层
- `discord.js` 的事件对象、类型和 helper 不应泄漏进 `discord-inbound.ts`
- runtime、policy、binding、delivery 逻辑不能依赖 `discord.js`

## 5.4 主服务不再启动 gateway

主服务启动后只负责：

- API routes
- Discord interactions webhook
- schedule/task-run/reflection 等已有后台能力

主服务不再直接 `startDiscordGatewayWorkers()`。

这条边界是 sidecar 设计成立的前提。

## 5.5 sidecar 只负责 mention / reply-to-bot ingress

sidecar 只处理 Discord gateway 上的 `MESSAGE_CREATE` 事件，并且仅接受：

- mention bot
- reply-to-bot

sidecar 不负责：

- slash command verify
- slash command HTTP response

slash command 继续由 [integrations-discord.ts](../../../apps/server/src/routes/integrations-discord.ts) 处理。

## 5.6 群聊 runtime 继续走 `chat_public_safe`

无论入口来自：

- slash command
- gateway mention
- gateway reply-to-bot

都继续复用：

- hidden conversation binding
- `runExternalMessageTurn(...)`
- `chat_public_safe`

sidecar 只改变“事件来自哪里、谁维护 websocket”，不改变 public-safe 产品边界。

## 5.7 v1 明确采用单 sidecar 实例假设

Phase 1 假设每个环境只有一个 Discord gateway sidecar 进程在运行。

不处理：

- 多实例 leader election
- 分布式 session ownership
- 跨实例 lease

这是合理取舍，因为当前目标场景本来就是本地运行与单环境部署。

## 6. 目标架构

```text
Discord Gateway WebSocket
  -> discord gateway sidecar process
     -> normalize MESSAGE_CREATE
     -> POST /internal/integrations/discord/inbound-message

internal HTTP
  -> main server process
     -> dedupe / binding / runExternalMessageTurn
     -> sendDiscordMessage

Discord Interactions Webhook
  -> main server process
     -> verify signature
     -> executeDiscordInboundPrompt
     -> HTTP response body

Server-owned Runtime / DB Boundary
  -> external_event_receipts
  -> external_conversation_bindings
  -> runExternalMessageTurn(chat_public_safe)
  -> Discord target delivery
```

更具体一点：

```text
Process A: main server
  - /v1/integrations/discord/events
  - /internal/integrations/discord/inbound-message
  - config routes
  - chat/runtime routes

Process B: discord gateway sidecar
  - list active profiles
  - reconcile runnable Discord configs
  - own discord.js client sessions
  - forward normalized mention/reply into internal server route
```

## 7. 模块设计

本设计要求把当前单体 `discord-gateway.ts` 拆成更小、职责单一的模块。

## 7.1 目标文件结构

```text
apps/server/src/integrations/
  discord-gateway-normalize.ts
  discord-inbound.ts

apps/server/src/routes/
  integrations-discord.ts
  integrations-discord-internal.ts

apps/server/src/sidecars/discord-gateway/
  discordjs-client.ts
  internal-runtime-client.ts
  reconcile.ts
  runner.ts
  index.ts
```

## 7.2 各文件职责

### `discord-gateway-normalize.ts`

纯函数模块，只做 gateway `MESSAGE_CREATE` 到 inbound prompt 的归一化。

负责：

- 判断是否是 bot mention
- 判断是否是 reply-to-bot
- 过滤 bot 自己发的消息
- 生成 `{ eventId, scopeKey, targetId, latestUserText }`

不负责：

- DB
- runtime
- websocket
- send reply

### `discord-inbound.ts`

共享 inbound runtime 服务，负责：

- dedupe receipt
- hidden conversation binding lookup/create
- `runExternalMessageTurn(...)`
- outbound send

这个模块是 imperative shell，但输入输出必须明确，不隐藏依赖。

它需要暴露两个层次的函数：

- `executeDiscordInboundPrompt(...)`
  - 适合 slash command 路径
  - 只执行 runtime，返回 assistant text
- `handleDiscordInboundMessage(...)`
  - 适合 internal HTTP 路径
  - 在前者之上增加 dedupe 和 channel reply

### `routes/integrations-discord-internal.ts`

server 内部路由，负责：

- 校验 internal bearer token
- 解析 sidecar 发来的 normalized inbound prompt
- 调用 `handleDiscordInboundMessage(...)`
- 返回结构化执行结果给 sidecar

它不是 public route，不对外部客户端开放。

### `sidecars/discord-gateway/discordjs-client.ts`

负责封装 `discord.js` client。

负责：

- 创建和销毁 `discord.js` client
- 订阅 message 相关事件
- 把 `discord.js` message 对象投影成仓库内部的 normalize 输入
- 把 transport 事件转换成 sidecar 可消费的回调

不负责：

- profile 扫描
- 配置收敛
- DB
- runtime

它只接收一个明确的 `onNormalizedInboundPrompt(...)` 回调。

### `sidecars/discord-gateway/internal-runtime-client.ts`

sidecar 的 internal HTTP client。

负责：

- 调用 `/internal/integrations/discord/inbound-message`
- 附带 internal bearer token
- 处理响应状态和错误日志

### `sidecars/discord-gateway/reconcile.ts`

纯函数模块，负责从“当前 session 状态”和“期望 session 状态”生成 plan。

建议暴露：

- `buildRunnableDiscordSessionSpec(...)`
- `diffDiscordGatewaySessions(...)`

输出 plan 只包含明确动作：

- `start`
- `stop`
- `restart`
- `keep`

### `sidecars/discord-gateway/runner.ts`

imperative shell，负责：

- 周期性读取 profiles + config
- 调用 `reconcile.ts` 得到 plan
- 真正 start / stop / restart sessions
- 维护内存里的 session registry

### `sidecars/discord-gateway/index.ts`

sidecar entrypoint，负责：

- `ensureSchema()`
- 启动 runner
- 处理进程退出信号
- 打印启动日志

## 8. 关键数据结构

## 8.1 `DiscordGatewayInboundPrompt`

```ts
type DiscordGatewayInboundPrompt = {
  eventId: string;
  scopeKey: string;
  targetId: string;
  latestUserText: string;
};
```

这是 gateway normalize 与 internal relay / server inbound runtime 之间的显式边界。

## 8.2 `DiscordGatewaySessionSpec`

```ts
type DiscordGatewaySessionSpec = {
  profileId: string;
  appId: string;
  botToken: string;
  fingerprint: string;
};
```

说明：

- `fingerprint` 用于判断配置是否变化
- `fingerprint` 可以由 `appId + botToken` 计算得出
- 日志里只输出 `fingerprint` 或其缩略值，不能输出原始 token

## 8.3 `DiscordGatewaySessionRegistryEntry`

```ts
type DiscordGatewaySessionRegistryEntry = {
  spec: DiscordGatewaySessionSpec;
  stop: () => void;
  startedAt: string;
};
```

registry 只存在 sidecar 进程内存中，不需要持久化。

## 9. 关键流程

## 9.1 sidecar 启动流程

```text
start sidecar
  -> ensureSchema()
  -> read runtime config
  -> reconcile once immediately
  -> schedule reconcile interval
  -> wait for process signals
```

这里的“立即 reconcile 一次”很重要，否则 sidecar 启动后要等一个 interval 才会真正建连。

## 9.2 mention / reply-to-bot 流程

```text
Discord MESSAGE_CREATE
  -> discord.js client receives message event
  -> normalizeDiscordGatewayMessage(...)
  -> POST /internal/integrations/discord/inbound-message
  -> handleDiscordInboundMessage(...)
     -> recordExternalEventReceipt(...)
     -> get/create external conversation binding
     -> runExternalMessageTurn(chat_public_safe)
     -> sendDiscordMessage(...)
```

行为要求：

- 非 mention 且非 reply-to-bot：直接忽略
- bot 作者消息：直接忽略
- 内容清洗后为空：直接忽略
- internal route 返回 duplicate：直接记日志并结束

## 9.3 slash command 流程

slash command 不通过 sidecar。

继续保持：

```text
Discord interactions webhook
  -> verify signature
  -> executeDiscordInboundPrompt(...)
  -> HTTP response content
```

这条路径只需要把共享逻辑从旧 `discord-gateway.ts` 挪到 `discord-inbound.ts`。

## 9.4 配置更新流程

sidecar runner 周期性做：

```text
listActiveProfiles()
  -> getEffectiveDiscordConfig(profileId)
  -> build desired session specs
  -> diff with running sessions
  -> start / stop / restart
```

收敛规则：

- 之前没 session，现在有 runnable spec：`start`
- 之前有 session，现在 config disabled / invalid / profile removed：`stop`
- 之前有 session，`fingerprint` 变化：`restart`
- 之前有 session，fingerprint 不变：`keep`

## 9.5 进程关闭流程

收到 `SIGINT` / `SIGTERM` 后：

- 停止 reconcile timer
- 依次调用所有 session `stop()`
- 退出进程

这里不做复杂 drain，因为 Discord gateway 没有“消费完手头 backlog 再退出”的要求。

## 10. Reconcile 设计

为了避免继续出现“读一遍 profile -> 启一次 worker”的一次性逻辑，runner 必须把 reconcile 设计为显式 plan。

推荐形态：

```text
profiles + effective configs
  -> buildRunnableDiscordSessionSpec(...)
  -> desired session map

running session map + desired session map
  -> diffDiscordGatewaySessions(...)
  -> reconciliation plan

reconciliation plan
  -> apply plan imperatively
```

其中：

- `buildRunnableDiscordSessionSpec(...)` 是纯函数
- `diffDiscordGatewaySessions(...)` 是纯函数
- `apply plan` 是 side-effect shell

这可以把“哪些 profile 应该启动/重启/停止”从 websocket 实现细节里剥离出来。

## 11. 配置与常量

## 11.1 延续现有环境变量

继续使用：

- `BUNI_DISCORD_GATEWAY_ENABLED`

## 11.2 新增环境变量

建议新增：

- `BUNI_DISCORD_GATEWAY_RECONCILE_INTERVAL_MS`
- `BUNI_INTERNAL_API_BASE_URL`
- `BUNI_INTERNAL_API_TOKEN`

默认值建议：

- `DEFAULT_DISCORD_GATEWAY_RECONCILE_INTERVAL_MS = 30_000`

其中：

- `BUNI_INTERNAL_API_BASE_URL` 默认可推导为 `http://127.0.0.1:${PORT ?? 8787}`
- `BUNI_INTERNAL_API_TOKEN` 必须显式配置，sidecar 与 server 共用同一值

这里明确要求：

- 不要在代码里散落 `30000` 这种 magic number
- 所有运行时数字都要有具名常量

## 11.3 本地开发脚本

建议新增根脚本：

```json
{
  "scripts": {
    "dev:discord-gateway-sidecar": "cd apps/server && dotenv -e .env.dev -- bun --hot src/sidecars/discord-gateway/index.ts"
  }
}
```

本地开发时需要两个进程：

- `bun run dev:server`
- `bun run dev:discord-gateway-sidecar`

## 12. 错误处理与恢复策略

## 12.1 `discord.js` transport 异常

Gateway transport 的重连与底层连接维护交给 `discord.js` 处理。

sidecar 自己负责的是：

- 记录 client ready / disconnect / error 日志
- 在 reconcile 判断配置变化时主动销毁并重建 client

也就是说：

- transport 级 reconnect 不再由我们手写 heartbeat / reconnect timer
- 配置级 restart 仍然由 sidecar runner 显式控制

## 12.2 inbound runtime 失败

当 `handleDiscordInboundMessage(...)` 内部失败时：

- 记录带 profileId / eventId / scopeKey 的错误日志
- 本次事件不再自动重试

这是现有语义的延续，而不是 sidecar 新引入的问题。

## 12.3 internal HTTP 失败

sidecar 调用 internal route 失败时：

- 记录带 profileId / eventId / scopeKey 的错误日志
- 本次事件不自动重试

原因：

- localhost hop 失败通常意味着 server 不可用或 internal auth 配置错误
- v1 不引入 sidecar 本地重试队列

## 12.4 Discord 发送失败

`sendDiscordMessage(...)` 失败时：

- 记录错误日志
- 不做自动重发

原因：

- 当前没有消息队列与 delayed retry 机制
- 盲目重试容易造成重复回复

## 12.5 配置错误

如果某个 profile 的 Discord config 缺少：

- `enabled !== true`
- `botToken`
- `appId`

则该 profile 不生成 runnable session spec。

这类情况只在 reconcile 日志中记为“不可运行”，不应让整个 sidecar 启动失败。

## 13. 安全边界

本设计必须保持以下边界不变：

- 群聊 runtime 继续使用 `chat_public_safe`
- 不暴露个人 memory recall/write 能力给 Discord 群
- 不在日志中打印 bot token 或原始消息全文
- internal route 必须要求 bearer token，不能作为公开 API 暴露
- 不让 gateway sidecar 绕过现有 messaging config 与 target resolution

sidecar 的职责只是接入 Discord gateway，不是新建一条绕过产品边界的“后台特权通道”。

## 14. 可观测性

v1 先不新增 metrics backend，但要求日志前缀统一。

建议日志前缀：

- `[buni/discord-gateway-sidecar]`
- `[buni/discord-discordjs-client]`
- `[buni/discord-inbound]`

至少记录以下事件：

- sidecar started / stopped
- reconcile started / finished
- session started / restarted / stopped
- discord.js client ready / disconnect / error
- inbound prompt ignored
- duplicate event ignored
- inbound runtime failed
- Discord send failed

## 15. 测试策略

建议测试拆成四层：

### 15.1 `discord-gateway-normalize.test.ts`

覆盖：

- mention 消息归一化
- reply-to-bot 归一化
- bot 消息忽略
- 空文本忽略

### 15.2 `discord-inbound.test.ts`

覆盖：

- dedupe receipt
- hidden conversation binding 复用/创建
- `runExternalMessageTurn(chat_public_safe)` 调用
- send reply

### 15.3 `discordjs-client.test.ts`

覆盖：

- `discord.js` message 事件到 normalize 输入的投影
- bot/self message 过滤
- mention / reply-to-bot 的 message 透传
- client ready / disconnect / error 事件日志

### 15.4 `discord-gateway-sidecar.test.ts`

覆盖：

- 只为 runnable profile 启动 session
- config 变化导致 restart
- profile/config 被移除导致 stop
- sidecar 启动时立即 reconcile 一次

## 16. Rollout 方案

建议按以下顺序落地：

### Phase 1：模块拆分

- 把旧 `discord-gateway.ts` 拆成 normalize / inbound / internal route / sidecar adapter 几层
- 保持行为不变

### Phase 2：sidecar runner

- 新增 `discord.js` adapter、internal runtime client、runner / reconcile / entrypoint
- 让 sidecar 独立拉起并可通过 internal HTTP 跑通 mention/reply

### Phase 3：主服务去耦

- 从 [index.ts](../../../apps/server/src/index.ts) 移除 gateway 启动
- 主服务保留 webhook route 与 internal inbound route

### Phase 4：脚本与文档

- 增加 `dev:discord-gateway-sidecar`
- 更新相关开发文档

## 17. 风险与取舍

## 17.1 receipt 仍然是 best-effort，而不是可重放语义

这是当前设计有意接受的范围边界。

sidecar 本身不解决：

- receipt 已写入但 runtime 尚未完成时的 crash recovery
- 精确一次投递

如果未来要补，需要单独设计 receipt status / replay 机制。

## 17.2 slash command 的“本地运行”问题仍未解决

sidecar 解决的是 gateway mention / reply。

如果要让 `/buni` 在纯本地环境也可用，还需要额外设计：

- 公网 relay
- local tunnel
- 或 Discord interaction edge proxy

这应作为独立后续设计，而不是混入当前 sidecar 方案。

## 17.3 多实例不是当前目标

如果未来需要多个 sidecar 实例共同运行，则必须新增：

- lease / ownership
- leader election
- session 抢占规则

当前不应为此提前复杂化单机设计。

## 18. 最终结论

当前仓库里的 Discord gateway 能力已经能证明 mention/reply 路径成立，但它仍然只是主服务内嵌 worker，不是 sidecar。

推荐方案是：

- 保持同仓
- 增加独立 sidecar entrypoint
- sidecar 采用 `discord.js` 作为 Gateway transport adapter
- 通过 internal HTTP 把 normalized inbound prompt 交给 server
- 由 server 统一执行 runtime 并直接发送 Discord 回复
- 主服务不再承载 gateway websocket 生命周期

这样可以在不引入额外 RPC/queue 复杂度的前提下，先获得正确的进程边界和更清晰的长期演进方向。
