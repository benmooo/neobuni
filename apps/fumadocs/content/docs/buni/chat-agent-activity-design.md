---
title: "Buni Chat Agent Activity 设计文档"
---

# Buni Chat Agent Activity 设计文档

> 版本：1.0  
> 日期：2026-04-30

---

## 0. 目标

这份文档定义 Buni 聊天页内的 AI `reasoning / thinking / tool calling` 状态展示方案。

目标不是重做 runtime observability。

你们已经有独立的 runtime spans 页面，所以这次设计只解决聊天主界面的两个问题：

- 用户在 AI 生成中，不能只看到一个“三个点”的黑盒状态
- 聊天页应该直接回答“AI 现在在干嘛”，而不是要求用户跳到 runtime 页面排查

这份设计**明确不包含**：

- 不把 runtime spans 通过 `CUSTOM/STATE_DELTA` 再推一遍到聊天页
- 不把聊天页变成调试控制台
- 不要求 V1 就实现完整的历史 reasoning 回放

---

## 1. 当前实现与约束

### 1.1 当前实现

当前聊天页的实时状态非常粗：

- `MessageList` 只根据 `isLoading` 决定是否展示 `TypingIndicator`
- `TypingIndicator` 只渲染三个点
- `MessageBubble` 只渲染 `message.parts` 里的 `text`
- `usePersistentChat` 没有消费 `onChunk`

结果是：

- thinking 内容即使存在，也不会展示
- tool call / tool result 即使进入 `UIMessage.parts`，也不会展示
- 当前阶段完全丢失，只剩一个统一的“正在输入”

### 1.2 现有数据边界

聊天页本轮设计只依赖以下两类数据：

1. `useChat()` 暴露的 `messages / status / isLoading / onChunk`
2. `UIMessage.parts`

不依赖：

- runtime spans 接口
- 自定义 stream chunk
- 新的 server push 协议

### 1.3 当前持久化约束

历史消息当前只持久化：

- `role`
- `kind`
- `content`
- `metadata`

而 `dbMessageToUIMessage()` 会把历史消息重建成单一 `text` part。

这意味着：

- 刷新页面后，历史 `thinking` / `tool-call` / `tool-result` 不会自动恢复
- 如果要支持“历史回放”，需要单独设计消息持久化扩展

---

## 2. 设计结论

## 2.1 结论一：聊天页展示“活动状态”，不是复制 runtime timeline

聊天页的目标是：

- 用最小认知负担告诉用户 AI 正在做什么
- 把和当前回复强相关的信息放在当前 assistant message 周围
- 不复制 runtime 页面已经承担的诊断职责

因此聊天页展示层分成两层：

1. **Live Activity Card**
   用一句话概括当前状态，例如：
   - 正在思考
   - 正在调用工具：`resolve_news_source`
   - 正在等待工具结果
   - 正在生成回答

2. **Rich Assistant Message**
   在 assistant message 内按 part 类型展示：
   - `thinking`
   - `tool-call`
   - `tool-result`
   - `text`

### 2.2 结论二：V1 不做 runtime 级 server 阶段实时同步

因为 runtime 页面已经存在，聊天页 V1 不展示以下阶段：

- `retrieval_signals`
- `temporal_recall`
- `soul_runtime`
- `prompt_build`
- `assistant_message_persist`

聊天页只展示 TanStack AI 客户端天然可以感知的内容：

- assistant 是否已经开始思考
- thinking 文本是否流入
- tool call 是否开始 / 参数是否完整 / 是否等待审批 / 是否拿到结果
- assistant 是否开始输出正文

### 2.3 结论三：V1 默认只保证“实时可见”，不保证“刷新后完整保留”

这是本设计最重要的产品取舍。

推荐默认值：

- **实时状态必须好**
- **刷新后历史回放先不做**

理由：

- 这是最小改动、最小风险路径
- 当前数据库 schema 天然是纯文本导向
- runtime 页面已经承担历史诊断能力
- reasoning / tool artifact 的长期存储是另一类设计问题，不应该和聊天页实时体验绑死

---

## 3. 用户体验目标

## 3.1 体验原则

聊天页状态展示遵守以下原则：

- **可感知**：用户随时知道 AI 是否在工作、在做什么
- **可扫描**：默认只显示摘要，不把原始 JSON 糊到主界面
- **可展开**：thinking 和 tool 明细可按需展开
- **可降级**：模型不支持 reasoning 时，仍然有统一 activity 文案
- **不抢正文**：最终回答始终是主角，状态展示是辅助信息

## 3.2 目标状态

聊天页内，用户应当能观察到以下状态：

| 状态                 | 用户文案                     | 来源                         |
| -------------------- | ---------------------------- | ---------------------------- |
| submitting           | 正在发送请求                 | `status`                     |
| thinking             | 正在思考                     | `isLoading` + 尚无 text 输出 |
| tool input streaming | 正在准备工具参数：`toolName` | `tool-call.state`            |
| tool waiting         | 正在调用工具：`toolName`     | `tool-call.state`            |
| tool approval        | 等待确认工具调用：`toolName` | `tool-call.approval`         |
| generating text      | 正在生成回答                 | assistant `text` part        |
| completed            | 已完成                       | `isLoading=false`            |
| aborted              | 已停止生成                   | `stop()` / abort error       |
| failed               | 生成失败                     | `error`                      |

---

## 4. 信息架构

## 4.1 聊天页内的展示层次

推荐结构：

```text
MessageList
  ├─ existing historical messages
  ├─ live assistant activity card
  ├─ current assistant rich bubble
  └─ composer
```

### A. Live Activity Card

只在“当前请求未结束”时出现。

建议放在消息列表底部、assistant 当前回复之前，作为单独卡片，不直接复用旧的 `TypingIndicator`。

它的职责是：

- 概括当前阶段
- 展示当前 tool 名称
- 在没有正文之前给用户持续反馈

它不负责：

- 展示完整 thinking transcript
- 展示完整 tool args/result JSON

### B. Rich Assistant Message

assistant message 内部按 part 顺序渲染：

1. `thinking`
2. `tool-call`
3. `tool-result`
4. `text`

展示策略：

- `thinking` 默认折叠
- `tool-call` 默认展示结构化参数内容
- `tool-result` 默认展示结构化结果内容
- `text` 正常作为正文展示

### C. Runtime Page

保留原有职责：

- 完整 spans 时间线
- 内部阶段细节
- 诊断与排障

聊天页不复制这些内容。

---

## 5. 状态模型

## 5.1 前端领域模型

新增一个纯前端状态模型：

```ts
type AssistantActivityStage =
  | "idle"
  | "submitting"
  | "thinking"
  | "tool_input_streaming"
  | "tool_waiting"
  | "tool_approval"
  | "generating"
  | "completed"
  | "aborted"
  | "error";

type AssistantActivity = {
  stage: AssistantActivityStage;
  label: string;
  toolName: string | null;
  toolCallId: string | null;
  hasThinking: boolean;
  hasText: boolean;
  errorMessage: string | null;
};
```

这个模型必须是**派生状态**，不是新的事实来源。

也就是：

- 事实来源仍然是 `status / isLoading / error / messages / onChunk`
- `AssistantActivity` 只是展示层归一化结果

## 5.2 派生规则

建议按优先级派生：

1. `error` 存在 -> `error`
2. request 被用户 stop / abort -> `aborted`
3. `isLoading=false` 且存在本轮 assistant message -> `completed`
4. 最新 assistant part 中存在 `tool-call` with approval pending -> `tool_approval`
5. 最新 assistant part 中存在 `tool-call.state === input-streaming` -> `tool_input_streaming`
6. 最新 assistant part 中存在 `tool-call` 但还没有对应 `tool-result` -> `tool_waiting`
7. 最新 assistant part 中已有 `text` -> `generating`
8. 最新 assistant part 中已有 `thinking` 但还没有 `text` -> `thinking`
9. `status === submitted` -> `submitting`
10. `isLoading=true` -> `thinking`
11. fallback -> `idle`

这套规则必须写成纯函数，例如：

```ts
const deriveAssistantActivity = (input: DeriveAssistantActivityInput): AssistantActivity => ...
```

不要把判断散在多个组件里。

---

## 6. 数据流设计

## 6.1 Hook 层职责

`usePersistentChat()` 从当前简单包装，升级为“聊天 UI 状态适配层”。

它应负责：

- 调用 `useChat()`
- 通过 `onChunk` 捕获实时 chunk
- 识别当前活跃 assistant message
- 派生 `AssistantActivity`
- 暴露 richer return value 给聊天页

建议返回值扩展为：

```ts
type PersistentChatState = {
  messages: UIMessage[];
  send: (content: string) => Promise<void>;
  isLoading: boolean;
  status: ChatClientState;
  stop: () => void;
  clear: () => void;
  error?: Error;
  activity: AssistantActivity;
  activeAssistantMessageId: string | null;
};
```

## 6.2 为什么仍然需要 `onChunk`

虽然 `UIMessage.parts` 最终会收敛为我们需要的数据，但 `onChunk` 仍然有价值：

- 允许更早更新 activity 文案
- 允许在 parts 尚未稳定前展示过渡状态
- 允许后续按需做更细的 loading micro-state

但 `onChunk` 只用来更新**临时展示状态**，不成为新的持久事实源。

## 6.3 活跃 assistant message 识别

新增纯函数：

```ts
const getActiveAssistantMessage = (messages: UIMessage[]) => UIMessage | null;
```

推荐规则：

- 从尾部向前找最新 assistant message
- 仅在本轮 `isLoading=true` 时把它视为 active
- 如果当前还没创建 assistant message，则 `activeAssistantMessage = null`

---

## 7. 组件设计

## 7.1 组件拆分

建议新增以下组件：

### A. `AssistantActivityCard`

职责：

- 展示当前 activity 的一句话摘要
- 根据 stage 展示视觉状态
- 在 tool 阶段展示当前 `toolName`

输入：

```ts
type AssistantActivityCardProps = {
  aiName: string;
  activity: AssistantActivity;
  onStop?: () => void;
};
```

### B. `AssistantMessageParts`

职责：

- 遍历 assistant `message.parts`
- 按类型分发到子组件

### C. `ThinkingBlock`

职责：

- 展示 `thinking` part
- 默认折叠
- 支持“展开思考过程”

### D. `ToolCallBlock`

职责：

- 展示工具名称
- 展示工具阶段
- 展示参数摘要
- 可展开原始参数 JSON

### E. `ToolResultBlock`

职责：

- 展示工具执行结果摘要
- 错误时突出失败状态
- 可展开原始结果/错误

### F. `TextBlock`

职责：

- 渲染正文 text parts

## 7.2 对现有组件的调整

### `MessageBubble`

从“只拼 text”的组件改成“message shell + parts renderer”：

- user message 仍然走当前轻量气泡路径
- assistant message 改为内部渲染 `AssistantMessageParts`

### `MessageList`

替换当前单一 `TypingIndicator`：

- 有 `activity` 时显示 `AssistantActivityCard`
- 不再单独使用只有三个点的指示器

---

## 8. 展示策略

## 8.1 Thinking 展示策略

推荐默认值：

- 默认折叠
- 标题显示“思考中”或“已整理思路”
- 不默认展示完整原文

理由：

- raw thinking 通常冗长
- 主聊天页不应该被思维链淹没
- 用户通常更关心“它在想”而不是“它怎么想”

展开后可展示：

- thinking 文本
- 可能的长度截断与“查看更多”

## 8.2 Tool 展示策略

默认展示：

- `toolName`
- 当前状态
- 结构化内容

例如：

```text
正在调用工具 resolve_news_source
```

```text
工具 resolve_news_source 已完成
```

默认展示内容不是“一句话摘要”，而是**结构化块**：

- 参数对象按 key-value 展示
- 结果对象按 key-value 展示
- 深层 JSON 仍使用折叠展开

也就是：

- 用户先看到结构化内容
- 复杂嵌套数据再延迟到 disclosure 中

不要把完整原始 JSON 字符串直接塞进正文气泡。

## 8.3 失败与中断

工具失败或模型失败时：

- activity card 显示失败状态
- 当前 assistant message 内保留已产生内容
- 如果有 tool error，工具块显示错误摘要

用户主动 stop 时：

- activity card 切为“已停止生成”
- 已生成的正文保留
- 不把 stop 误判成系统错误

## 8.4 Thinking 可见性设置

需要提供用户级设置项：

- 设置名建议：`显示思考过程`
- 默认值：关闭

行为：

- 关闭时：thinking block 默认不渲染，只保留 activity card 的“正在思考 / 已整理思路”状态文案
- 开启时：thinking block 参与 assistant message 渲染，但仍然默认折叠

这样可以同时满足：

- 默认体验干净
- 愿意观察 reasoning 的用户可以主动打开
- 不需要为普通用户暴露过多内部细节

---

## 9. 持久化策略

## 9.1 V1 推荐：不扩展消息持久化

V1 不修改历史消息 schema 来保存完整 `thinking/tool-call/tool-result`。

含义：

- richer 状态主要服务于实时会话
- 刷新后历史消息仍退化为纯文本回放
- 如果用户需要精确排查，去 runtime 页面

## 9.2 为什么不在 V1 做历史回放

如果要做历史回放，至少要解决：

- assistant 多 part 数据如何序列化
- tool args/result 存在哪个 message 里
- thinking 是否允许持久化
- message 编辑/删除后的兼容逻辑
- 老数据如何迁移

这是独立 project，不应该与当前聊天体验修复混做。

## 9.3 V2 可选方向

如果未来要做历史回放，推荐两条路选一条：

### 方案 A：扩展 `messages.metadata`

把 assistant part snapshot 写进 `messages.metadata.parts`

优点：

- 不加新表
- 与现有 message 生命周期绑定

缺点：

- metadata 结构会快速膨胀
- tool/result/thinking 的演进兼容成本高

### 方案 B：新增 `message_artifacts` 表

独立存储：

- `messageId`
- `artifactType`
- `payload`
- `seq`

优点：

- 演进更清晰
- 不污染 message 主表

缺点：

- 复杂度更高

本设计不在 V1 里选型实现，只在这里保留方向。

---

## 10. 服务端改动边界

## 10.1 V1 不需要协议改动

因为聊天页 V1 只使用现有 TanStack AI 能力，所以服务端原则上不需要：

- 新增聊天 stream chunk 类型
- 新增 runtime-to-chat 同步逻辑
- 改动 `/v1/runtime/*` 路由

## 10.2 唯一可选的服务端增强

如果你们希望真正展示 reasoning 内容，而不是仅展示“正在思考”，则需要确认当前 provider 配置是否会产出 thinking parts。

这个增强属于 provider/adapter 配置层，不属于聊天页展示层的阻塞项。

因此应拆成独立任务：

- 先完成聊天页 richer rendering
- 再按 provider 能力决定是否开启 reasoning output

---

## 11. 实施边界与存储决策

## 11.1 `显示思考过程` 的存储位置

本设计将 `显示思考过程` 定义为**本地 UI 偏好**，不是账号级 agent 配置。

推荐实现：

- 在前端本地 `localStorage` 保存
- 范式与现有 theme 设置保持一致
- 不进入 `agent_configs`
- 不走 `/v1/config/agent`

原因：

- 这是显示偏好，不影响模型行为
- 不需要跨设备一致才成立
- 避免为了一个 UI 开关改 server schema / API contract

建议 key：

```ts
const STORAGE_KEY = "buni-chat-display";
```

建议结构：

```ts
type ChatDisplayPreferences = {
  showThinking: boolean;
};
```

默认值：

```ts
const defaultChatDisplayPreferences = {
  showThinking: false,
};
```

## 11.2 如果未来要跨设备同步

如果后续确认这个设置需要跨设备同步，再升级为账号级配置。

优先顺序建议：

1. 保持当前本地方案先上线
2. 如果用户明确有跨设备一致性需求
3. 再考虑把 display preferences 挂到：
   - `agent_configs` 新字段
   - 或新的 `ui_preferences` 配置对象

当前版本不做这件事。

---

## 12. 纯函数清单

为了保持功能核心纯净，推荐把以下逻辑抽成纯函数：

```ts
const getActiveAssistantMessage = (messages: UIMessage[]) => UIMessage | null;

const deriveAssistantActivity = (input: {
  isLoading: boolean;
  status: ChatClientState;
  error?: Error;
  activeAssistantMessage: UIMessage | null;
  lastAbortReason?: string | null;
}) => AssistantActivity;

const summarizeToolArguments = (toolName: string, input: unknown) => string;

const summarizeToolResult = (toolName: string, output: unknown, error?: string) => string;

const getMessageTextContent = (message: UIMessage) => string;

const partitionAssistantParts = (parts: MessagePart[]) => {
  thinkingParts: ThinkingPart[];
  toolCallParts: ToolCallPart[];
  toolResultParts: ToolResultPart[];
  textParts: TextPart[];
};
```

这些函数应该放在独立模块，例如：

- `apps/mobile/src/components/chat/activity-model.ts`
- `apps/mobile/src/components/chat/message-parts.ts`

不要在组件 render 中直接写条件树。

---

## 13. 文件级实施计划

下面是推荐的实际改动文件清单。

## 13.1 新增文件

### A. `apps/mobile/src/components/chat/activity-model.ts`

职责：

- 定义 `AssistantActivity`
- 实现 `deriveAssistantActivity`
- 实现 `getActiveAssistantMessage`
- 实现 tool/thinking/text part 提取逻辑

建议导出：

```ts
export type AssistantActivityStage = ...
export type AssistantActivity = ...

export const getActiveAssistantMessage = (...) => ...
export const deriveAssistantActivity = (...) => ...
export const partitionAssistantParts = (...) => ...
export const summarizeToolData = (...) => ...
```

### B. `apps/mobile/src/components/chat/AssistantActivityCard.tsx`

职责：

- 渲染当前 activity 状态卡
- 展示 stage 文案、tool name、stop 按钮

### C. `apps/mobile/src/components/chat/AssistantMessageParts.tsx`

职责：

- 把 `message.parts` 分发给对应子组件

### D. `apps/mobile/src/components/chat/ThinkingBlock.tsx`

职责：

- thinking 内容展示
- 折叠/展开

### E. `apps/mobile/src/components/chat/ToolCallBlock.tsx`

职责：

- tool call 展示
- 参数结构化渲染

### F. `apps/mobile/src/components/chat/ToolResultBlock.tsx`

职责：

- tool result 展示
- 错误态展示

### G. `apps/mobile/src/components/chat/StructuredDataBlock.tsx`

职责：

- 通用结构化 key-value 渲染
- 深层对象折叠

### H. `apps/mobile/src/components/chat/chat-display-preferences.tsx`

职责：

- 本地显示偏好 provider / hook
- `showThinking` 的 localStorage 读写

建议 API：

```ts
type ChatDisplayPreferences = {
  showThinking: boolean;
};

type ChatDisplayPreferencesContextValue = ChatDisplayPreferences & {
  setShowThinking: (value: boolean) => void;
};
```

## 13.2 修改文件

### A. `apps/mobile/src/hooks/use-persistent-chat.ts`

改动：

- 给 `useChat` 增加 `onChunk`
- 输出 `activity`
- 输出 `activeAssistantMessageId`
- 可选保留 `lastAbortReason`

### B. `apps/mobile/src/components/chat/MessageList.tsx`

改动：

- 接收 `activity`
- 接收 `onStop`
- 用 `AssistantActivityCard` 替换 `TypingIndicator`

### C. `apps/mobile/src/components/chat/MessageBubble.tsx`

改动：

- user message 仍按 text-only 渲染
- assistant message 改走 `AssistantMessageParts`

### D. `apps/mobile/src/routes/_app/chat/$conversationId.tsx`

改动：

- 从 `usePersistentChat` 取 `activity / stop`
- 传递给 `MessageList`

### E. `apps/mobile/src/routes/__root.tsx`

改动：

- 挂载 `ChatDisplayPreferencesProvider`

### F. `apps/mobile/src/routes/_app/settings/index.tsx`

改动：

- 新增一个聊天显示设置 section
- 提供 `显示思考过程` 开关

## 13.3 当前不改的文件

以下文件在 V1 不应成为必改项：

- `apps/server/src/routes/chat.ts`
- `apps/server/src/routes/runtime.ts`
- `apps/server/src/ai/runtime-observer.ts`
- `apps/server/src/ai/chat-turn-service.ts`
- `packages/db/src/schema/messages.ts`

除非单独推进“让 provider 真正产出 thinking parts”的任务。

---

## 14. 分阶段实施计划

## Phase 1：渲染层升级

目标：

- assistant message 能渲染非 text parts
- 三个点替换为 activity card

改动：

- `MessageBubble`
- `MessageList`
- 新增 `AssistantActivityCard`
- 新增 `ThinkingBlock / ToolCallBlock / ToolResultBlock`
- 新增 `StructuredDataBlock`

交付标准：

- 工具调用时，聊天页能看到 tool name 和状态
- 有 thinking part 时，聊天页能折叠展示

## Phase 2：Hook 状态适配

目标：

- `usePersistentChat` 输出规范化 `activity`

改动：

- 给 `useChat` 增加 `onChunk`
- 增加纯函数派生 activity
- 新增 `ChatDisplayPreferencesProvider`

交付标准：

- `submitted / thinking / tool / generating / error / aborted` 能正确切换
- `showThinking` 开关能即时生效

## Phase 3：视觉和文案打磨

目标：

- 状态更清晰
- 工具结构化展示更可读
- thinking 设置接入完成

改动：

- 优化状态色彩
- 加入 tool args/result 结构化渲染
- 统一中英文 tool label
- 增加 `显示思考过程` 设置项

## Phase 4：可选的 provider reasoning 能力接入

目标：

- 真正让支持 reasoning 的模型产出 thinking content

这一步是可选增强，不是聊天页 richer 状态的前置条件。

---

## 15. 验收标准

## 15.1 功能验收

至少覆盖以下场景：

1. **纯文本回复**
   - 发送消息
   - activity 从 `submitting -> thinking/generating -> completed`
   - assistant 正文正常展示

2. **有 thinking part 的回复**
   - 关闭“显示思考过程”时不渲染 thinking block
   - 开启后渲染 thinking block，默认折叠

3. **tool call 成功**
   - 显示 tool name
   - 显示结构化参数
   - 显示结构化结果
   - 最终继续生成正文

4. **tool call 失败**
   - tool block 显示轻量失败提示
   - 聊天页整体不进入灾难态 UI

5. **用户 stop**
   - activity 切为“已停止生成”
   - 已输出正文保留

6. **刷新页面**
   - 历史纯文本消息正常
   - 不要求恢复历史 thinking/tool block

## 15.2 技术验收

- 新增状态推导逻辑尽量以纯函数实现
- `MessageBubble` 不再直接手写 part 解析逻辑
- `showThinking` 偏好本地持久化
- `typecheck` 通过

---

## 16. 风险与缓解

## 13.1 风险：thinking 内容过长，污染主聊天流

缓解：

- 默认折叠
- 长文本截断
- 只显示标题和预览

## 13.2 风险：tool result 是结构化 JSON，展示很脏

缓解：

- 第一层使用结构化 key-value 呈现
- 深层 JSON 放到 details / disclosure 中

## 13.3 风险：provider 不产出 thinking part，用户预期落空

缓解：

- activity card 不依赖 thinking content 才能工作
- 没有 thinking part 时也显示“正在思考”

## 13.4 风险：刷新后 richer 状态消失，用户困惑

缓解：

- 文案和产品预期上明确这是“实时 activity”
- 需要历史诊断时引导到 runtime 页面

---

## 17. 已决产品决策

1. `thinking` 默认不显示，需要用户开启“显示思考过程”；开启后仍默认折叠
2. `tool args/result` 默认展示结构化内容，深层 JSON 折叠展开
3. 历史消息刷新后丢失 `thinking/tool` 细节，V1 可接受
4. 工具失败显示提示即可，不把整个聊天页打成危险态
5. 用户点击 stop 后使用“已停止生成”
6. 需要“显示思考过程”设置项
7. `显示思考过程` 在 V1 里按本地显示偏好实现，不做账号级同步

---

## 18. 推荐下一步

当前已确认的默认决策如下：

- 聊天页只做实时 activity，不做历史回放
- 不引入 runtime spans 到聊天页
- `thinking` 默认隐藏，用户开启后才显示；显示后仍默认折叠
- `tool-call` / `tool-result` 默认结构化展示，深层 JSON 折叠
- 失败可见，但轻量提示
- stop 状态显示“已停止生成”
- 提供“显示思考过程”设置项
- 后续如需更强透明度，再单独做历史 artifact 持久化

这是一条实现成本最低、用户收益最高、与现有 runtime 页面职责最不冲突的路径。

推荐按以下顺序开工：

1. 先做 `activity-model.ts + AssistantActivityCard + usePersistentChat` 状态链路
2. 再做 `MessageBubble` 的 parts renderer
3. 再做 settings 开关和本地偏好 provider
4. 最后补结构化 tool data 的视觉打磨和验收
