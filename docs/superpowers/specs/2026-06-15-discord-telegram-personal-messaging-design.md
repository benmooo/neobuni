---
title: "Buni Discord / Telegram Personal Messaging Runtime 设计稿"
---

# Buni Discord / Telegram Personal Messaging Runtime 设计稿

> 状态：approved
> 日期：2026-06-15
> 相关文档：
>
> - [../../../ARCHITECTURE.md](../../../ARCHITECTURE.md)
> - [../../execution-layer/schedule-agent-worker-v1.md](../../execution-layer/schedule-agent-worker-v1.md)
> - [../../platform/provider-protocol-first-runtime.md](../../platform/provider-protocol-first-runtime.md)
> - [../../../apps/server/src/runtime/load-turn-context.ts](../../../apps/server/src/runtime/load-turn-context.ts)
> - [../../../apps/server/src/runtime/create-chat-turn-stream.ts](../../../apps/server/src/runtime/create-chat-turn-stream.ts)
> - [../../../apps/server/src/runtime/run-headless-task-turn.ts](../../../apps/server/src/runtime/run-headless-task-turn.ts)
> - [../../../apps/server/src/task-runs/worker.ts](../../../apps/server/src/task-runs/worker.ts)
> - [../../../packages/contracts/src/execution-layer/schedule.ts](../../../packages/contracts/src/execution-layer/schedule.ts)

## 0. 目的

本文定义 Buni 第一版 Discord / Telegram personal-mode integration 的目标架构。

这次要解决的问题不是“把 Buni 变成群共享人格”，也不是“重做记忆系统”。

这次要解决的是：

- 让用户可以把自己的 Buni 接到 Discord 和 Telegram 群
- 在群里通过 `@buni`、回复 bot、或命令触发 Buni
- 让 Buni 可以通过定时任务主动向群里推送文本消息
- 保持 Buni 的 owner 仍然是 `profile = 用户本人`
- 明确避免把个人记忆默认暴露给群聊

## 1. 产品边界

## 1.1 本次明确采用 personal-mode

本次不做“群拥有一个共享 Buni”。

本次采用的产品边界是：

- `profile` 仍然表示一个用户自己的 Buni
- Discord / Telegram 群只是 Buni 的外部 interaction surface 和 delivery surface
- 群聊上下文可以保留会话连续性，但不拥有自己的独立 memory owner
- 用户的长期记忆仍然归属于该用户的 `profile`

这意味着：

- 不需要先把 memory schema 改造成 group-scoped
- 不需要现在引入群成员共享记忆
- 不需要现在引入 friend-level identity graph

## 1.2 Phase 1 范围

Phase 1 只做：

- text-only 入站与出站
- Discord 群聊触发
- Telegram 群聊触发
- schedule 驱动的主动推送
- profile-scoped target 配置

Phase 1 不做：

- 图片、文件、语音、inline button、卡片
- Telegram / Discord 私聊
- 群成员各自绑定到 Buni 内部用户身份
- 群共享记忆
- 多 bot / 多 tenant orchestration
- 复杂 moderation / permission 系统

## 2. 当前现状与问题

当前仓库已经具备两块可复用能力：

1. chat runtime 已经有明确的 provider / tool / observer / persistence 链路
2. `schedule -> task_run -> headless task turn` 已经基本成型

但当前平台集成仍然是 platform-specific 形态：

- Feishu 与 QQ 各自维护独立 config、target、tool、integration
- schedule delivery intent 仍然带有 `feishuTargetAlias`
- turn context 默认会加载用户的 unresolved / recent memories

因此当前问题不是“没有定时任务”，而是：

- 缺少统一的 messaging runtime
- 缺少统一的 external conversation binding
- 缺少 surface policy 来约束群聊能看到什么

### 2.1 现有可复用资产

- [run-headless-task-turn.ts](../../../apps/server/src/runtime/run-headless-task-turn.ts)
  - 已经能让后台 worker 脱离前台请求执行 agent turn
- [worker.ts](../../../apps/server/src/task-runs/worker.ts)
  - 已经能 claim `task_run`、执行、重试、记录结果
- [schedule.ts](../../../packages/contracts/src/execution-layer/schedule.ts)
  - 已经有 schedule blueprint 和 delivery intent 基本形状

### 2.2 当前不满足目标的地方

- [load-turn-context.ts](../../../apps/server/src/runtime/load-turn-context.ts) 默认总会加载用户 memory slices
- [create-chat-turn-stream.ts](../../../apps/server/src/runtime/create-chat-turn-stream.ts) 仍然把 chat orchestration 集中在一个 request/SSE shell 中
- 现有平台 tools 仍然是 `send_feishu_message` / `send_qq_message`
- 外部平台消息没有统一的 inbound normalization 和 outbound delivery 抽象

## 3. 设计目标

本次设计需要满足：

- 保持 `profile` 为唯一 memory owner
- 新增 Discord / Telegram 群聊 interaction surface
- 群里触发与主动推送共用一套 messaging runtime
- 用 surface policy 显式约束群聊可见能力和可见上下文
- 让 schedule delivery intent 从 platform-specific 变成 generic channel target
- 尽量复用现有 `task_run` worker 和 runtime observer 能力
- 保持 contracts / tools / integrations / runtime 分层清楚

## 4. 核心决策

## 4.1 采用“方案 2：messaging runtime 抽象”

不采用：

- 继续复制 `Feishu -> Discord -> Telegram` 三套几乎一样的集成代码
- 现在就升级成 group-owned shared-memory architecture

采用：

```text
profile-owned Buni
  -> surface policy
  -> unified messaging runtime
     -> Discord adapter
     -> Telegram adapter
  -> hidden internal conversation
  -> standard agent runtime
```

## 4.2 群聊默认必须走 `public_safe` surface

这是本设计最重要的安全边界。

Phase 1 的群聊触发默认不是普通 chat surface，而是 `public_safe` surface。

`public_safe` 的原则：

- 不默认加载个人 unresolved / recent memories
- 不暴露 `save_memory` / `update_memory` / `resolve_memory_conflict` / `recall_memory`
- 允许 world-facing 和 delivery-facing tools
- 允许 schedule tools
- 输出默认按“面向群可见”语气生成

这样可以满足：

- “帮我整理最近热门消息”
- “帮我创建定时推送”
- “帮我把一段内容发到群里”

但不会让群聊天然获得：

- 用户私人偏好
- 历史未决任务
- 关系类记忆
- 连续的 autobiographical memory recall

## 4.3 群聊连续性依赖 hidden conversation，不依赖 memory recall

Phase 1 的群聊连续性主要来自：

- 绑定到外部 target 的内部 `conversation`
- conversation message history
- recent runtime turns

而不是来自用户私人 memory store。

这使得：

- Buni 能记住“这个群里刚刚聊到哪”
- 但不会把“用户人生里其他地方的长期记忆”直接带进群里

## 5. 平台策略

## 5.1 Discord

Discord Phase 1 采用 bot-first 策略。

支持：

- 群里 `@buni`
- 回复 bot 消息
- `/buni ...` slash command
- 主动发送文本消息到已配置 target

不采用“只有 incoming webhook”的路径，因为那只能单向发消息，不适合作为群里触发入口。

同时把 slash command 作为一等入口，避免把 Phase 1 完全押在 message-content 策略上。

## 5.2 Telegram

Telegram Phase 1 采用：

- webhook 入站
- `/buni ...`
- reply-to-bot

明确接受：

- 不做自由文本群监听
- 保持 privacy mode 兼容

这条边界是有意为之。

它可以显著降低：

- 群消息过载
- 隐私顾虑
- 平台行为差异带来的复杂度

## 6. 目标架构

```text
Discord / Telegram Event
  -> platform adapter verify + normalize
  -> surface policy resolution
  -> external conversation binding lookup
  -> hidden internal conversation load/create
  -> runAgentTurn(...)
  -> assistant text
  -> platform adapter sendMessage(...)

Schedule
  -> materializer
  -> task_run
  -> worker
  -> runAgentTurn(...)
  -> send_channel_message(...)
  -> platform adapter sendMessage(...)
```

### 6.1 分层

建议新增：

```text
packages/contracts/src/platform/messaging/
packages/contracts/src/execution-layer/send-channel-message.ts
packages/contracts/src/execution-layer/list-channel-targets.ts

apps/server/src/integrations/messaging/
  types.ts
  policy.ts
  registry.ts
  delivery.ts
  discord.ts
  telegram.ts

apps/server/src/runtime/
  run-agent-turn.ts
  run-external-message-turn.ts
```

职责：

- `contracts`
  - tool contracts
  - messaging target / integration schemas
- `integrations/messaging`
  - platform verification
  - inbound normalization
  - outbound delivery
- `runtime/*`
  - surface-aware turn execution
- `tools/*`
  - tool handler 和 appendEvent

## 7. Surface Policy 设计

新增统一 surface 枚举：

```ts
type RuntimeSurface =
  | "chat_private"
  | "chat_public_safe"
  | "task_run_private"
  | "task_run_public_safe";
```

新增 surface policy 结构：

```ts
type SurfacePolicy = {
  surface: RuntimeSurface;
  allowMemoryRecall: boolean;
  allowMemoryWrite: boolean;
  allowAutobiographicalContext: boolean;
  allowScheduleMutation: boolean;
  toolAllowlist: string[] | null;
  responseVisibility: "private" | "group";
};
```

### 7.1 `chat_public_safe`

群聊 mention / reply / command 使用：

- `allowMemoryRecall = false`
- `allowMemoryWrite = false`
- `allowAutobiographicalContext = false`
- `allowScheduleMutation = true`
- `responseVisibility = "group"`

默认 tool allowlist 至少包含：

- web / news tools
- `now`
- `create_schedule`
- `update_schedule`
- `delete_schedule`
- `list_schedules`
- `get_schedule`
- `send_channel_message`
- `list_channel_targets`

不包含：

- `save_memory`
- `update_memory`
- `resolve_memory_conflict`
- `recall_memory`

### 7.2 `task_run_public_safe`

针对“主动向群里推送”的定时任务：

- 不需要 memory recall
- 允许使用 news / web / send channel tools
- delivery intent 绑定到特定 channel target

## 8. Runtime Refactor

## 8.1 抽出 `runAgentTurn(...)`

当前：

- [create-chat-turn-stream.ts](../../../apps/server/src/runtime/create-chat-turn-stream.ts) 仍然承担过多 orchestration
- [run-headless-task-turn.ts](../../../apps/server/src/runtime/run-headless-task-turn.ts) 复用了部分逻辑，但仍然是 headless-specialized 路径

目标：

```text
runAgentTurn(...)
  -> load turn context by surface policy
  -> retrieval / signal / prompt compile
  -> provider stream
  -> tool runtime
  -> persistence / observer

createChatTurnStream(...)
  -> request/SSE wrapper around runAgentTurn(...)

runHeadlessTaskTurn(...)
  -> task-run wrapper around runAgentTurn(...)

runExternalMessageTurn(...)
  -> messaging adapter wrapper around runAgentTurn(...)
```

### 8.2 `loadTurnContext(...)` 变成 surface-aware

当前 [load-turn-context.ts](../../../apps/server/src/runtime/load-turn-context.ts) 的行为对群聊不安全。

需要改成：

- 根据 `surfacePolicy` 决定是否加载 unresolved / recent memories
- 根据 `surfacePolicy` 决定是否暴露 memory embedding / reasoning config
- 根据 `surfacePolicy` 决定使用哪套 tools

这一步是 Phase 1 的必要升级，不是可选优化。

## 9. Messaging 数据模型

## 9.1 新表

推荐新增以下表：

### `messaging_integrations`

```ts
{
  id: string;
  profileId: string;
  platform: "discord" | "telegram";
  enabled: boolean;
  botToken: string;
  appId?: string | null;
  publicKey?: string | null;
  webhookSecret?: string | null;
  metadataJson: string;
  createdAt: string;
  updatedAt: string;
}
```

用途：

- 保存 profile-scoped 平台连接信息

### `messaging_targets`

```ts
{
  id: string;
  profileId: string;
  platform: "discord" | "telegram";
  alias: string;
  label: string;
  targetType: "channel" | "group" | "supergroup" | "topic";
  targetId: string;
  enabled: boolean;
  metadataJson: string;
  createdAt: string;
  updatedAt: string;
}
```

用途：

- 统一管理“可以发到哪里”
- 用于 tool alias 和 schedule delivery intent

### `external_conversation_bindings`

```ts
{
  id: string;
  profileId: string;
  platform: "discord" | "telegram";
  scopeType: "guild_channel" | "telegram_chat";
  scopeKey: string;
  conversationId: string;
  lastInboundAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

用途：

- 把外部群聊目标绑定到 Buni 内部隐藏 conversation

### `external_event_receipts`

```ts
{
  id: string;
  profileId: string;
  platform: "discord" | "telegram";
  eventId: string;
  receivedAt: string;
}
```

用途：

- webhook / retry 去重

## 9.2 现有表保留

保留不动：

- `profiles`
- `conversations`
- `messages`
- `memories`
- `task_runs`
- `runtime_turns`
- `events`

这是本次“不是 memory refactor”的关键体现。

## 10. Schedule 合同升级

当前 [schedule.ts](../../../packages/contracts/src/execution-layer/schedule.ts) 的 `deliveryIntent` 仍然带有 `feishuTargetAlias`。

需要重构为通用结构：

```ts
type ScheduleChannelTarget = {
  platform: "discord" | "telegram" | "feishu" | "qq";
  targetAlias?: string | null;
  targetId?: string | null;
};

type ScheduleDeliveryIntent = {
  conversationId: string | null;
  channelTarget: ScheduleChannelTarget | null;
};
```

这样可以让：

- 老的 Feishu / QQ 逐步迁到通用 channel runtime
- 新的 Discord / Telegram 直接走统一 delivery path

## 11. Tool Surface 升级

## 11.1 新增通用 tools

新增：

- `list_channel_targets`
- `send_channel_message`

输入建议：

```ts
type SendChannelMessageInput = {
  platform?: "discord" | "telegram" | "feishu" | "qq";
  targetAlias?: string;
  targetId?: string;
  message: {
    type: "text";
    text: string;
  };
};
```

输出建议：

```ts
type SendChannelMessageOutput = {
  delivered: boolean;
  platform: "discord" | "telegram" | "feishu" | "qq";
  targetAlias: string | null;
  targetId: string;
  messageId: string | null;
  preview: string;
};
```

## 11.2 老 tools 迁移策略

Phase 1 不要求立即删除：

- `send_feishu_message`
- `send_qq_message`

但新功能必须优先使用通用 tools。

策略：

- Discord / Telegram 只接通用 tool
- Feishu / QQ 后续再逐步迁移

## 12. HTTP 路由与安全

建议新增：

- `POST /v1/integrations/discord/events`
- `POST /v1/integrations/telegram/events`
- `GET/PUT /v1/config/messaging/discord`
- `GET/PUT /v1/config/messaging/telegram`

### 12.1 Discord

需要处理：

- webhook/interactions signature verify
- application command payload
- mention / reply 入站规范化

### 12.2 Telegram

需要处理：

- webhook secret token 校验
- update 去重
- command / reply 路由

## 13. 内部 conversation 策略

外部群聊不能直接把消息当作“无状态触发器”。

Phase 1 需要为每个外部 target 维护一个隐藏的内部 conversation：

- 用户不可在普通聊天页直接看到它
- 但它可以用于：
  - conversation history
  - runtime turn continuity
  - debugging
  - event traceability

这样既能保留上下文，也不需要把外部平台消息强行建成独立 memory owner。

## 14. 实现顺序

## Phase A: runtime & contracts

- 抽出 `runAgentTurn(...)`
- 引入 `RuntimeSurface` 与 `SurfacePolicy`
- 让 `loadTurnContext(...)` 支持 surface-aware 行为
- 新增 generic schedule delivery intent contract

## Phase B: messaging storage & tools

- 新增 messaging tables
- 新增 config repo / target repo
- 新增 `list_channel_targets` / `send_channel_message`
- 新增 messaging settings route

## Phase C: Discord

- 新增 Discord adapter
- 打通 bot / slash command / reply path
- 建立 external conversation binding
- 打通主动发消息

## Phase D: Telegram

- 新增 Telegram adapter
- 打通 webhook / command / reply path
- 打通主动发消息

## Phase E: polish

- 统一 event payload
- 增加 observability 和 failure logs
- 逐步把 Feishu / QQ 往 generic runtime 迁移

## 15. 测试策略

至少需要覆盖：

- surface policy 不允许群聊读取 personal memory
- external event receipt 去重
- external conversation binding 复用
- schedule delivery intent 对 generic channel target 的 materialize
- Discord adapter 入站校验与出站 payload
- Telegram adapter 入站校验与出站 payload
- `send_channel_message` alias 解析与显式 target 解析

## 16. 风险与取舍

### 16.1 不做 group-owned memory 是有意取舍

这会让 Phase 1 更快，但也意味着：

- 群不会形成真正共享的人际记忆
- Buni 不会成为“朋友圈共同拥有的助理”

这是正确取舍，因为当前目标是“个人 Buni 外挂到群”，不是“群拥有 Buni”。

### 16.2 `public_safe` 会降低个性化程度

群里回复会比私聊更克制、更工具化。

这也是有意为之：

- 它减少隐私泄漏
- 它让平台接入更安全
- 它符合 public surface 的产品定位

## 17. 最终结论

本次推荐方案是：

1. 不升级 memory 主架构
2. 新增 unified messaging runtime
3. 新增 surface policy，把群聊固定为 `public_safe`
4. 把 schedule delivery intent 升级为 generic channel target
5. 先做 Discord + Telegram text-only

一句话总结：

> 这不是“给 Buni 再接两个 bot”，而是把 Buni 从单一 chat surface 升级成一个带受控 public surface 的 personal agent runtime。
