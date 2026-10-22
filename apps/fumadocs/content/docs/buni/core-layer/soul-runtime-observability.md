---
title: "Buni V1 SOUL Runtime Observability 设计文档"
---

# Buni V1 `SOUL` Runtime Observability 设计文档

> 版本：1.0  
> 日期：2026-04-27

---

## 0. 目的

这份文档定义 Buni V1 的 `SOUL` runtime pipeline observability 方案。

目标不是做一个通用日志系统，而是解决一个更具体的问题：

**对于每一个 chat turn，系统要能回答“这一轮到底发生了什么”。**

也就是：

- 用户输入何时进入系统
- 当前轮命中了哪些 memory
- `SOUL` runtime 如何完成 appraisal / protective / stance / response plan
- provider 流式生成是否正常
- 是否发生 tool call
- assistant message 何时落库
- 整个 turn 最终是成功、失败还是中断

---

## 1. 背景问题

当前 runtime pipeline 已经成立，但可观测性仍然缺失。

现状是：

- `packages/core/src/core-layer/soul-runtime.ts` 已经能产出结构化 `SoulRuntimeState`
- `apps/server/src/ai/chat-service.ts` 会在流式回复前构建 `soulRuntime`
- 这个结果目前只被折叠进 system prompt
- 系统没有把每一轮 runtime 决策过程持久化为 turn-level trace

因此现在很难回答这些问题：

- 为什么这一轮 protective level 升级了
- 为什么这一轮 stance 选成了 `protective` 或 `mobilizing`
- memory recall 是否命中、命中了什么
- provider 慢在哪里、失败在哪里
- assistant message 与本轮 runtime 决策如何一一对应

---

## 2. V1 目标与非目标

### 2.1 目标

V1 必须做到：

- 以 **chat turn** 为单位记录 pipeline 执行轨迹
- 以 **stage/span** 为单位记录关键步骤的输入、输出、耗时和状态
- 让服务端成为对话与 trace 的唯一事实源
- 支持按 `conversationId` 和 `turnId` 查询 runtime timeline
- 提供本地 / 内部使用的 developer timeline 界面

### 2.2 非目标

V1 暂不做：

- 外部 APM / OpenTelemetry 接入
- 面向最终用户的 debug UI
- 所有后台任务统一纳入 trace
- 完整 metrics 平台
- 完整 prompt 原文持久化

---

## 3. 核心设计决策

### 3.1 采用 turn-scoped trace，而不是继续复用通用 `events`

现有 `events` 更接近业务审计事件，例如：

- `message.created`
- `memory.updated`
- `conversation.deleted`

这类事件适合做 CRUD 审计，不适合表达：

- 一个 turn 内部多个阶段的生命周期
- 同一轮里多个 span 的顺序和耗时
- provider stream 和 tool call 的中间状态
- `SOUL` runtime 的结构化快照

因此 V1 新增独立的 runtime trace 数据模型，不和通用 `events` 混用。

### 3.2 服务端成为唯一事实源

V1 明确采用：

- 服务端持久化 user message
- 服务端执行 runtime pipeline
- 服务端持久化 assistant message
- 服务端 finalize turn

客户端不再负责把本轮 assistant message 在流结束后补写回数据库。

### 3.3 `messages` 增加显式 `turnId`

V1 在 `messages` 表增加 `turnId`，而不是只把 turn 关联塞进 `metadataJson`。

理由：

- `turnId` 是后续查询和排障的一级关联键
- timeline 需要快速从 turn 跳到 request / response message
- tool message、assistant message 和主 turn 的关联应该是结构化外键关系

### 3.4 默认不存完整 prompt

V1 默认策略：

- 原始 message 内容仍由 `messages` 表承担
- runtime trace 里存结构化摘要、决策快照和必要 hash
- 不把完整 prompt 原文作为默认持久化内容

这样可以降低噪声、风险和存储体积。

### 3.5 V1 纳入 `tool_call` span

`tool_call` 是 runtime pipeline 的一部分。

如果只记录 provider stream，而不记录 tool call：

- 无法看清模型为什么暂停
- 无法看清某轮响应为什么变慢
- 无法判断失败发生在 LLM 本身还是 tool 执行阶段

因此 V1 直接纳入 `tool_call` span。

---

## 4. 为什么不应该继续依赖客户端上传完整 `messages`

这里需要明确：**TanStack AI 默认上传完整 `messages` 的行为本身没有问题。**

它成立的前提是：

- 服务端尽量无状态
- 客户端持有完整会话上下文
- 服务端只把“这次请求收到的 messages”喂给模型，然后流式返回结果

这对很多普通 chat app 是合理的。

但 Buni V1 的目标不是一个“尽量无状态”的聊天接口，而是一个**服务端有状态的陪伴系统**。  
一旦系统具备以下能力，继续依赖客户端上传完整 `messages` 就会变成架构冲突：

- 服务端数据库是 conversation history 的主存储
- 服务端负责 memory recall
- 服务端负责 `SOUL` runtime 决策
- 服务端需要做 turn-level trace
- 服务端负责 assistant message persistence

继续让客户端上传完整 `messages` 的问题主要有 5 个：

### 4.1 会出现双重事实源

如果客户端上传的历史和服务端数据库中的历史都被视为有效输入，那么系统实际上会有两份 history：

- client-side assembled history
- server-side persisted history

一旦二者不一致，就很难定义“这一轮到底基于哪份上下文做出的决策”。

### 4.2 trace 无法闭环

turn trace 要回答的是：

- 本轮 request message 是哪条
- 本轮 response message 是哪条
- 本轮 runtime snapshot 基于哪些服务端已知数据得出

如果实际喂给模型的是客户端拼出来的一段 `messages`，而不是服务端从 DB 重建出的 history，那么 trace 记录和真实模型输入之间会存在漂移。

### 4.3 assistant persistence 会继续割裂

当前客户端在流结束后补写 assistant message，这意味着：

- 服务端并不知道 response message 最终何时持久化
- turn 是否真正完成无法由服务端独立判断
- trace 和 message persistence 之间不存在强一致边界

这和“服务端成为唯一事实源”的目标直接冲突。

### 4.4 未来 memory / tools / active workflows 会更难控

随着系统进入更强状态化：

- memory 可能会插入 context
- tool results 可能会形成消息
- background workflow 可能会回写 conversation

此时如果仍然要求客户端持有并上传完整会话历史，就会迫使客户端参与本不该由它负责的状态拼装。

### 4.5 安全和约束边界更模糊

服务端作为核心执行面，应该明确知道：

- 哪些 message 是已持久化的
- 哪些 message 属于本轮新增输入
- 哪些内容可被纳入 prompt

如果大量依赖客户端上传完整上下文，服务端会更像“接受一段外部组装好的 prompt 输入”，而不是“基于受控状态自行构建执行上下文”。

### 4.6 结论

因此 V1 的方向不是说 TanStack AI 默认行为“错了”，而是：

**它优化的是 stateless chat；而 Buni 需要的是 stateful runtime。**

所以 V1 设计中，`/v1/chat/stream` 应收敛到：

- `conversationId`
- 本轮 `user input`
- 可选的 `clientRequestId`

服务端再基于数据库重建 history，并完成 runtime pipeline。

### 4.7 迁移策略

考虑到当前前端使用了 `useChat` 默认工作流，V1 实施时可以分两步：

1. 过渡阶段：接口兼容接收 `messages`，但服务端只信任本轮最新 user input，并忽略客户端上传的历史上下文
2. 正式阶段：客户端 transport 改成只发送本轮 user input，完全切到 server-owned conversation state

V1 的目标状态是第 2 种。

---

## 5. 目标架构

```text
Client
  -> POST /v1/chat/stream
       -> create runtime turn
       -> persist user message
       -> run observed stages
            -> memory recall
            -> soul runtime
            -> prompt build
            -> provider stream
            -> tool calls (0..n)
       -> persist assistant message
       -> finalize turn
  -> SSE response

Developer Timeline UI
  -> query runtime turns
  -> query runtime spans
  -> render per-turn pipeline timeline
```

核心原则：

- core 保持纯函数
- observability 只在 server shell 层落地
- 每个 turn 只有一个 authoritative trace
- 每个重要阶段都有结构化 span

---

## 6. 数据模型

## 6.1 `runtime_turns`

每一行代表一个 chat turn。

建议字段：

- `id`
- `profileId`
- `conversationId`
- `requestMessageId`
- `responseMessageId`
- `status`：`running | completed | failed | aborted`
- `startedAt`
- `endedAt`
- `durationMs`
- `providerKey`
- `modelKey`
- `protectiveLevel`
- `primaryStance`
- `memoryCount`
- `toolCallCount`
- `errorCode`
- `errorJson`

职责：

- 提供 turn 级别摘要
- 支持列表页快速浏览
- 为 timeline 提供汇总头信息

## 6.2 `runtime_spans`

每一行代表 turn 内一个阶段或一次 tool call。

建议字段：

- `id`
- `turnId`
- `conversationId`
- `stage`
- `seq`
- `status`：`running | completed | failed | skipped`
- `startedAt`
- `endedAt`
- `durationMs`
- `inputJson`
- `outputJson`
- `errorJson`

职责：

- 表达 turn 内部执行顺序
- 记录阶段输入输出快照
- 承载局部失败和耗时信息

## 6.3 `messages.turnId`

`messages` 增加：

- `turnId`：nullable，外键关联到 `runtime_turns.id`

约定：

- user request message 写入当前 turn 的 `turnId`
- assistant response message 写入当前 turn 的 `turnId`
- tool message 在 V1 如果落库，也写入所属 `turnId`

---

## 7. Stage 设计

V1 固定 stage 枚举如下：

- `request_received`
- `user_message_persist`
- `retrieval_signals`
- `temporal_recall`
- `soul_runtime`
- `prompt_build`
- `provider_stream`
- `tool_call`
- `assistant_message_persist`
- `turn_finalize`

说明：

- `tool_call` 可重复出现
- `provider_stream` 表示一次主模型调用生命周期
- `turn_finalize` 用于标记 turn 进入最终状态

---

## 8. 各 Stage 的观测内容

## 8.1 `request_received`

输入：

- `conversationId`
- `clientRequestId`
- user input 摘要

输出：

- `turnId`
- accepted 时间

## 8.2 `user_message_persist`

输入：

- `conversationId`
- raw user input

输出：

- `requestMessageId`
- persisted 时间

## 8.3 `retrieval_signals`

输入：

- user input
- recent user texts
- unresolved / recent memory slices

输出：

- retrieval signals
- temporal activation 摘要
- temporal query package
- tool fallback 是否可用

## 8.4 `temporal_recall`

输入：

- temporal activation strategy
- query package
- embedding provider 摘要

输出：

- `memoryCount`
- 命中的 memory 摘要列表
- recall latency
- recall 是否 skipped / failed

## 8.5 `soul_runtime`

输入：

- `soulConfig` 摘要
- latest user text
- recent user texts
- recalled memory 摘要

输出：

- `appraisal`
- `protectiveDecision`
- `effectiveDriveOrder`
- `stanceDecision`
- `responsePlan`

这是 V1 最关键的观测快照。

## 8.6 `prompt_build`

输入：

- agent config 摘要
- memory 摘要
- soul runtime 摘要

输出：

- prompt hash
- system prompt 长度
- memory 注入数量
- `SOUL` runtime 是否注入

默认不落完整 prompt 原文。

## 8.7 `provider_stream`

输入：

- provider key
- model key
- message count

输出：

- `firstTokenAt`
- `endedAt`
- `durationMs`
- `finishReason`
- `providerOutcome`
- `textCharCount`
- `toolCallCount`
- token usage（若 provider 可得）

### 8.7.1 设计原则

`provider_stream` 需要明确区分两个概念：

1. **stage lifecycle status**
2. **provider business outcome**

这两个概念不能混用。

否则就会出现这种语义混乱：

- stream 技术上正常结束了
- 但模型实际上什么都没产出
- 最终 span 和 turn 却都被标成 `completed`

V1 之后，`provider_stream` 采用：

- `span.status` 表示阶段生命周期
- `providerOutcome` 表示阶段业务产出

### 8.7.2 `ProviderStreamEvidence`

服务端先收集事实，再做归类。

建议语义模型如下：

```ts
type ProviderContributionKind = "text" | "tool_activity";

type ProviderStreamEvidence = {
  contributionKinds: ProviderContributionKind[];
  textCharCount: number;
  toolCallCount: number;
  firstTokenAt: string | null;
  finishReason: string | null;
  usage: Record<string, unknown> | null;
  endedBy: "finish" | "abort" | "error" | null;
  durationMs: number | null;
  contentLength: number;
  abortReason: string | null;
  error: Record<string, unknown> | null;
};
```

要求：

- 这一层只描述“观察到了什么”
- 不在 evidence 层直接判断成功 / 失败
- 新的 provider 贡献类型只需要扩展 `contributionKinds`

### 8.7.3 `ProviderStreamOutcome`

基于 evidence，再做单独的纯函数归类：

```ts
type ProviderStreamOutcome = "text" | "tool_only" | "empty" | "aborted" | "error";
```

推荐规则：

```ts
classifyProviderStreamOutcome(evidence);
```

优先级：

1. `endedBy === "error"` -> `error`
2. `endedBy === "abort"` -> `aborted`
3. `textCharCount > 0` -> `text`
4. `toolCallCount > 0` -> `tool_only`
5. otherwise -> `empty`

这个函数是 `provider_stream` 语义的唯一判定入口。

以后如果系统新增：

- reasoning-only contribution
- structured output contribution
- approval-only contribution

都只需要扩展 outcome 分类函数，不要把条件散落到 turn finalize 中。

### 8.7.4 Span Status 映射

`runtime_span.status` 继续表示阶段生命周期，不表示业务成功。

| `providerOutcome` | `provider_stream.status` | 含义                                                 |
| ----------------- | ------------------------ | ---------------------------------------------------- |
| `text`            | `completed`              | provider 正常结束，并产出了文本                      |
| `tool_only`       | `completed`              | provider 正常结束，并产出了 tool activity            |
| `empty`           | `completed`              | provider 正常结束，但没有任何 assistant contribution |
| `aborted`         | `completed`              | provider 生命周期因 abort 正常收尾                   |
| `error`           | `failed`                 | provider 自身发生错误                                |

也就是：

- `empty` 不是 span 级 lifecycle failure
- `aborted` 也不是 span 级 lifecycle failure
- 只有真正的 provider error 才把 span 标成 `failed`

### 8.7.5 Turn Status 映射

turn 的最终状态不应该直接看散落条件，而应该基于 `providerOutcome` 做映射。

| `providerOutcome` | turn status | error code                |
| ----------------- | ----------- | ------------------------- |
| `text`            | `completed` | `null`                    |
| `tool_only`       | `completed` | `null`                    |
| `empty`           | `failed`    | `empty_provider_response` |
| `aborted`         | `aborted`   | `aborted`                 |
| `error`           | `failed`    | `provider_stream_failed`  |

建议在 server 层再定义一个显式的 turn 决议类型：

```ts
type ProviderTurnResolution =
  | {
      providerOutcome: "text" | "tool_only";
      status: "completed";
    }
  | {
      providerOutcome: "aborted";
      status: "aborted";
      errorCode: "aborted";
      error: Record<string, unknown>;
    }
  | {
      providerOutcome: "empty";
      status: "failed";
      errorCode: "empty_provider_response";
      error: Record<string, unknown>;
    }
  | {
      providerOutcome: "error";
      status: "failed";
      errorCode: "provider_stream_failed";
      error: Record<string, unknown>;
    };
```

建议统一通过：

```ts
resolveTurnFromProviderOutcome({ evidence, providerKey, modelKey });
```

把 `ProviderStreamEvidence` 翻译成 turn 级决议。

注意：

- `tool_only` 表示模型没有直接产出 text，但确实产生了 assistant contribution
- 后续是否还会有 assistant message persistence，由编排层决定
- turn finalize 不再直接写：
  - `assistantText.length === 0 && !sawToolActivity`
  - `contentLength === 0 && ...`

而是统一改成：

```ts
const providerOutcome = classifyProviderStreamOutcome(evidence);
```

然后只根据 `providerOutcome` 做 turn 级决策。

### 8.7.6 `provider_stream` 输出建议

`provider_stream.output` 应至少包含：

```ts
{
  (providerOutcome,
    contributionKinds,
    firstTokenAt,
    finishReason,
    durationMs,
    contentLength,
    textCharCount,
    toolCallCount,
    usage);
}
```

若 outcome 为 `aborted`，补充：

```ts
{
  abortReason;
}
```

若 outcome 为 `error`，错误信息进入 `runtime_span.error`。

resolveTurnFromProviderOutcome

NOTE:

- ProviderStreamEvidence / Outcome 描述的是 provider_stream 这个 span 里， LLM 到底做了什么。
- resolveProviderTurnResolution 做的是：把这个 provider stream span 的结果 翻译成 chat turn 最终该怎么收尾。

所以它不是在描述“整个 runtime pipeline 的全部语义”，而是在做一层：

provider_stream span result -> chat turn final status

## 8.8 `tool_call`

输入：

- tool name
- call id
- arguments 摘要

输出：

- result 摘要
- success / failure
- duration

补充语义：

- `tool_call` span 可以独立失败
- `tool_call` 失败不必然导致整个 turn 失败
- 如果模型能够基于 tool failure fallback 并继续完成回复，则 turn 仍可标记为 `completed`
- 因此 turn 级别需要能区分：
  - 最终是否完成
  - 中间是否出现 tool failure

## 8.9 `assistant_message_persist`

输入：

- accumulated assistant text
- metadata 摘要

输出：

- `responseMessageId`
- persisted 时间

## 8.10 `turn_finalize`

输入：

- turn 当前聚合状态

输出：

- final status
- total duration
- error summary

---

## 9. 服务端职责拆分

V1 建议新增两个 server 模块：

- `apps/server/src/ai/runtime-observer.ts`
- `apps/server/src/ai/chat-turn-service.ts`

### 9.1 `runtime-observer.ts`

职责：

- `startTurn`
- `startSpan`
- `completeSpan`
- `failSpan`
- `completeTurn`
- `failTurn`
- `abortTurn`

要求：

- 只做观测 side effects
- 不承担业务决策

### 9.2 `chat-turn-service.ts`

职责：

- 持久化 user message
- 读取服务端 authoritative history
- 调用 memory recall
- 构建 soul runtime
- 构建 system prompt
- 驱动 provider stream
- 收集 tool call span
- 落库 assistant message
- finalize turn

要求：

- 成为 chat turn 的唯一编排入口

---

## 10. API 设计

## 10.1 主 chat 接口

目标状态：

```ts
type ChatTurnStreamRequest = {
  conversationId: string;
  input: {
    content: string;
  };
  clientRequestId?: string;
};
```

约定：

- 服务端自己持久化 user message
- 服务端自己重建历史消息
- 服务端自己持久化 assistant message

## 10.2 runtime 查询接口

V1 新增：

- `GET /v1/runtime/turns?conversationId=...`
- `GET /v1/runtime/turns/:turnId`
- `GET /v1/runtime/turns/:turnId/spans`

这些接口只面向本地 / 内部开发使用。

---

## 11. Developer Timeline UI

V1 提供一个本地 / 内部使用的 timeline 页面。

一页里至少展示：

- turn 列表
- 每个 turn 的状态、总耗时、startedAt
- protective level
- primary stance
- memory recall 命中数
- tool call 数
- stage timeline
- `soul_runtime` 快照
- provider stream 摘要
- request / response message 跳转

V1 不要求打磨成正式产品界面。

---

## 12. 失败与中断语义

`runtime_turns.status` 的语义：

- `completed`：provider 正常完成，assistant message 成功持久化
- `failed`：任一关键阶段报错，turn 无法正常收口
- `aborted`：客户端断开或服务端主动中止
- `running`：turn 尚未结束

要求：

- provider 报错要能落到 `failed`
- client abort 要能落到 `aborted`
- 即便失败，也要尽量保留已完成 span
- `tool_call` 失败后若模型成功 fallback 并完成 assistant message 持久化，turn 仍记为 `completed`
- V1 建议在 turn 摘要层增加 `hadToolFailures` 之类的聚合字段，标识“本轮完成了，但中间发生过 tool failure”

---

## 13. 隐私与存储策略

V1 默认策略：

- 不持久化完整 prompt 原文
- `inputJson` / `outputJson` 只存结构化摘要
- 用户原文以 `messages` 表为准
- 运行时决策快照以 `runtime_spans` 为准

后续如果需要 debug 原始 prompt，应作为显式 debug mode，而不是默认行为。

---

## 14. 实施顺序

建议按以下顺序落地：

1. contracts 与 schema
2. repo 层
3. runtime observer primitives
4. chat route / service 改成 server-owned persistence
5. provider stream / tool call span 接入
6. runtime query API
7. developer timeline UI
8. 测试补齐

---

## 15. V1 完成标准

当满足以下条件时，V1 可认为完成：

- 任意一轮 chat 都能生成唯一 `turnId`
- request / response message 都能关联到 `turnId`
- `soul_runtime` span 能完整记录 runtime 快照
- provider stream 和 tool call 可被 timeline 看见
- turn 的成功、失败、中断状态可被正确区分
- 内部开发者可以按 conversation 查看每轮 timeline

---

## 16. Turn Summary 聚合字段

为了让 turn 列表页不必点开 span 也能看懂 recall 行为，turn 摘要层建议至少包含：

- `memoryRecallStrategy`
  - `pre_recall`
  - `tool_fallback`
  - `skip`
- `preRecallCount`
- `hadToolRecall`

语义：

- `memoryRecallStrategy` 表示这轮的前置 recall 决策
- `preRecallCount` 表示该 turn 中实际发生的前置 recall 次数
- `hadToolRecall` 表示该 turn 中是否通过 `recall_memory` tool 做过兜底 recall
