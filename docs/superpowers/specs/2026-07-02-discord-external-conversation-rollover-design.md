---
title: "Discord External Conversation Rollover 设计稿"
---

# Discord External Conversation Rollover 设计稿

> 状态：implemented
> 日期：2026-07-02
> 相关文件：
> - [../../../apps/server/src/integrations/discord-inbound.ts](../../../apps/server/src/integrations/discord-inbound.ts)
> - [../../../apps/server/src/routes/integrations-discord.ts](../../../apps/server/src/routes/integrations-discord.ts)
> - [../../../apps/server/src/runtime/run-external-message-turn.ts](../../../apps/server/src/runtime/run-external-message-turn.ts)
> - [../../../apps/server/src/runtime/load-turn-context.ts](../../../apps/server/src/runtime/load-turn-context.ts)
> - [../../../apps/server/src/runtime/create-chat-turn-stream.ts](../../../apps/server/src/runtime/create-chat-turn-stream.ts)
> - [../../../apps/server/src/runtime/build-provider-chat-options.ts](../../../apps/server/src/runtime/build-provider-chat-options.ts)
> - [../../../packages/db/src/repos/discord-external-conversation-rollover.ts](../../../packages/db/src/repos/discord-external-conversation-rollover.ts)
> - [../../../packages/db/src/repos/discord-external-conversations.ts](../../../packages/db/src/repos/discord-external-conversations.ts)
> - [../../../packages/db/src/repos/runtime-turns.ts](../../../packages/db/src/repos/runtime-turns.ts)
> - [../../../packages/db/src/schema/external-conversation-bindings.ts](../../../packages/db/src/schema/external-conversation-bindings.ts)
> - [../../../packages/db/src/schema/conversations.ts](../../../packages/db/src/schema/conversations.ts)

## 0. 目的

本文定义 Discord `guild_channel` external conversation 的 rollover 设计。

这次要解决的问题不是：

- 重做整个 messaging runtime
- 为 public-safe surface 引入 group-owned memory
- 删除旧消息或压缩历史存档
- 同时把 Telegram / private chat 一起改掉

这次要解决的是：

- 避免一个 Discord channel 永远绑定到同一个 hidden conversation
- 避免 provider request 随着 channel 连续聊天而无限膨胀
- 保留 channel 内短期连续性
- 保留完整历史和 runtime 审计数据

## 1. 背景

当前 Discord inbound 路径是：

```text
Discord inbound event
  -> scopeKey
  -> external_conversation_binding lookup
  -> hidden conversation create/reuse
  -> runExternalMessageTurn(...)
  -> createChatTurnStream(...)
  -> loadTurnContext(...)
  -> listMessages(conversationId)
  -> provider messages
```

当前实现有两个关键事实：

1. 同一个 `scopeKey = guild_id:channel_id` 会持续复用同一个 hidden `conversationId`
2. provider request 直接消费该 conversation 的全量 `persistedMessages`

因此在一个长期活跃的 Discord channel 中：

- `messages` 会持续增长
- `runtime_turns` 会持续增长
- provider input 会持续增长
- context 长度风险会直接与 channel 生命周期绑定

这与“transport continuity”和“reasoning window”应该分离的目标不一致。

## 2. 设计目标

本次设计需要满足：

- `scopeKey` 仍然是 Discord channel continuity 的唯一入口
- reasoning context 必须有明确上界
- rollover 后 binding 仍然只保留一个 active target
- 不删除旧消息、不破坏 runtime 审计链路
- 不依赖 public-safe memory digest 才能工作
- 尽量复用现有 hidden conversation、message persistence、runtime observer 链路

## 3. 非目标

本次不做：

- Telegram external conversation rollover
- Discord DM / private chat rollover
- 基于摘要消息的 carry-over prompt 注入
- 自动删除 archived conversation 的消息或 runtime turns
- 新增 group-scoped memory owner

## 4. 方案比较

### 4.1 方案 A：只做 runtime 限窗

只在 `loadTurnContext(...)` 或 provider input 层取最近 N 条消息。

优点：

- 改动最小

缺点：

- 这不是真 rollover
- `messages` / `runtime_turns` 仍然无限增长
- `scopeKey -> conversationId` 的语义仍然是永久绑定
- archived history 与 active window 没有清晰边界

### 4.2 方案 B：在同一 conversation 中裁剪旧消息

达到阈值后直接删除旧消息，只保留尾部。

优点：

- 单个 conversation 的 message 存储有上界

缺点：

- 会破坏 turn / message / span 的完整审计链路
- 历史回放和问题排查变差
- destructive，不符合当前项目更偏好保留历史事实的边界

### 4.3 方案 C：真实 window rollover + active binding 重定向

这是本次采用的方案。

核心思路：

- `external_conversation_binding` 继续按 `scopeKey` 唯一
- 但该 binding 只指向当前 active conversation window
- 达到阈值后创建新的 hidden conversation
- 旧 conversation 标记为 `archived`
- binding 更新到新的 conversation
- 新窗口带少量 seed messages，以保留短期连续性

## 5. 核心决策

## 5.1 `scopeKey` 绑定的是 active window，不是永久 conversation

`external_conversation_bindings` 不改唯一性规则：

- `profileId`
- `platform`
- `scopeType`
- `scopeKey`

仍然唯一。

但 `conversationId` 的语义变成：

> 该 external scope 当前正在写入和推理的 active hidden conversation window

这意味着：

- binding 是 continuity anchor
- conversation 是 bounded reasoning window

## 5.2 archived conversation 保留历史，不再继续承接新 turn

rollover 后旧 conversation：

- `hidden = true` 保持不变
- `status = "archived"`

新的 active conversation：

- `hidden = true`
- `status = "active"`

本次不删除 archived conversation 的 messages / runtime turns。

## 5.3 第一版使用 seed messages，不使用 digest summary carry-over

rollover 时，新窗口会复制旧窗口尾部少量消息作为 seed context。

第一版不做：

- summary message 注入
- digest memory 强依赖
- 额外 prompt contract 改造

原因：

- `chat_public_safe` 当前 `allowMemoryWrite = false`
- seed messages 已足够提供短期连续性
- 这条路径能最小化改动并复用现有 provider request 链路

## 6. Rollover 触发策略

采用混合策略，命中任一条件即 rollover。

```ts
const DISCORD_EXTERNAL_CONVERSATION_ROLLOVER_LIMITS = {
  maxWindowMessageCount: 120,
  maxWindowEstimatedTokens: 24_000,
  maxWindowIdleMs: 72 * 60 * 60 * 1000,
  seedMessageCount: 12,
} as const;
```

### 6.1 message count

统计当前 window 中会进入 provider transcript 的 persisted messages 数量。

即与 `normalizePersistedMessages(...)` 保持同一语义：

- 排除 `role = "system"`
- 保留 `user` / `assistant` / `tool`

### 6.2 estimated tokens

第一版不引入 tokenizer 依赖。

采用便宜且稳定的近似估算：

```text
estimatedTokens = ceil(totalNonSystemContentChars / 4)
```

它不是精确 token 计数，但足以作为 rollover 触发器。

### 6.3 idle window

如果当前 window 在当前入站前已经空闲超过阈值，也触发 rollover。

空闲判断基于当前 conversation 最后一条 persisted message 的 `createdAt`。

目的：

- 长时间断档后，新的 channel 话题默认进入新窗口
- 避免几周前的上下文继续污染当前会话

## 7. 数据模型与 repo 变更

本次不新增表。

## 7.1 复用已有字段

- `external_conversation_bindings.conversation_id`
  - 改为 active window 指针
- `conversations.status`
  - 使用已有 `active` / `archived` 语义
- `messages.metadata_json`
  - 记录 seed copy 来源信息

## 7.2 需要新增的 repo helper

### conversations repo

- `updateConversationStatus(id, status)`

### messages repo

- `listTailMessages(conversationId, limit)`
- `getConversationMessageStats(conversationId)`
  - 返回：
    - `messageCount`
    - `totalContentChars`
    - `estimatedTokens`
    - `lastMessageAt`

### messaging-config repo

- `updateExternalConversationBindingConversation(input)`
  - 把既有 binding 的 `conversationId` 更新到新 window

## 8. Seed message 规则

rollover 时，从旧窗口尾部复制最近 `seedMessageCount` 条非 system messages。

复制规则：

- 保持原 `role`
- 保持原 `kind`
- 保持原 `content`
- 复制 metadata，并附加 rollover 来源标记

建议附加：

```ts
{
  rollover: {
    kind: "seed_copy",
    sourceConversationId: string,
    sourceMessageId: string,
    sourceCreatedAt: string,
  }
}
```

复制后的 seed message 使用新 message id 和当前时间戳。

这样做的目的：

- provider 只关心新窗口里的可见 transcript
- 排障时仍然能追到来源

## 9. 运行链路

## 9.1 正常路径

```text
handleDiscordInboundMessage(...)
  -> recordExternalEventReceipt(...)
  -> resolve active binding
  -> inspect current conversation window
  -> keep current conversationId
  -> runExternalMessageTurn(...)
```

## 9.2 rollover 路径

```text
handleDiscordInboundMessage(...)
  -> recordExternalEventReceipt(...)
  -> resolve active binding
  -> inspect current conversation window
  -> rollover required
  -> create new hidden conversation
  -> copy seed tail messages
  -> archive old conversation
  -> rebind scopeKey -> new conversationId
  -> runExternalMessageTurn(...) on new window
```

## 9.3 binding 缺失或损坏

如果 binding 不存在，按当前逻辑创建第一个 hidden conversation。

如果 binding 存在，但 `conversationId` 不存在或 conversation 状态异常：

- 视为 stale binding
- 创建新的 active hidden conversation
- 直接把 binding 修复到新 conversation

## 10. 并发与事务边界

rollover 需要在一个 `immediate` SQLite transaction 内完成。

原因：

- 同一个 channel 可能短时间内连续触发多条 inbound event
- 如果 rollover 决策与 rebinding 分开，容易创建多个竞争中的新窗口

事务内步骤：

1. 重新读取 binding
2. 重新读取当前 active conversation stats
3. 判断是否需要 rollover
4. 若不需要，直接返回当前 `conversationId`
5. 若需要：
   - 创建新 conversation
   - 读取并复制 seed tail messages
   - 旧 conversation 标记 archived
   - binding 更新到新 conversation
6. 返回最终 active `conversationId`

目标不是保证“绝对零重复窗口”，而是保证：

- binding 最终只会收敛到一个 active conversation
- 当前 inbound turn 只落到事务返回的 active conversation

## 11. 与现有 runtime 的关系

本次不修改：

- `runExternalMessageTurn(...)`
- `createChatTurnStream(...)`
- `loadTurnContext(...)`
- `normalizePersistedMessages(...)`

这些模块继续假设：

- 给它们的 `conversationId` 就是当前 active reasoning window

换句话说，本次通过在 inbound runtime 边界切换 active conversation，来保持下游 runtime 不变。

## 12. 第一版明确不做的增强

未来可以做，但本次不做：

- seed copy 改成“summary + tail hybrid”
- 不同 channel 类型使用不同阈值
- archived window 自动清理
- Telegram 共用同一 rollover helper
- active window 的 ops / trace 可视化

## 13. 测试策略

### 13.1 纯逻辑测试

新增纯函数测试：

- 未达阈值时不 rollover
- 达到 message count 阈值时 rollover
- 达到 estimated token 阈值时 rollover
- 达到 idle 阈值时 rollover
- 空 conversation stats 时不误判

### 13.2 repo 测试

新增 repo 测试：

- conversation status 更新
- conversation message stats 聚合
- tail message 读取顺序正确
- binding conversationId 更新

### 13.3 inbound integration 测试

新增或改造 `discord-inbound.test.ts`：

- 首次消息创建第一个 hidden conversation
- 未达阈值时复用原 conversation
- 达阈值时创建新 conversation 并 rebind
- 新 conversation 包含 seed messages
- 旧 conversation 状态为 archived
- 当前 inbound turn 落在新 conversation

## 14. 成功标准

满足以下条件即算完成：

- 同一个 Discord `scopeKey` 不再永久绑定单个 conversation
- active reasoning window 有明确上界
- archived history 保留不删除
- provider request 不再随单个 channel 生命周期无限膨胀
- Discord inbound 相关测试覆盖 keep / rollover / rebind / seed copy 路径
- 相关 typecheck 与 focused tests 通过
