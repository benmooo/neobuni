---
title: "Buni Memory Recall Redesign"
---

# Buni Memory Recall Redesign

> 版本：1.0  
> 日期：2026-04-28

---

## 0. 目的

配套延伸设计：

- [retrieval-policy-redesign.md](./retrieval-policy-redesign.md)

这份文档定义 Buni V1 之后的 memory recall 重构方向。

目标不是重写整个 memory system，而是解决当前聊天链路里的一个具体问题：

**每个 chat turn 都会先跑一次 LLM-based recall router，导致平均延迟偏高。**

这份 redesign 的核心目标是：

- 降低每轮聊天的 recall 决策成本
- 保留需要前置 recall 的能力
- 给主聊天模型一个 `recall_memory` tool 兜底
- 避免把 recall 完全变成“每轮都查”或“完全靠模型临场决定”

---

## 1. 当前问题

当前实现的主路径是：

1. 用户输入新消息
2. 调 `runInstantDigestLLM(userMessage)`
3. 如果 `shouldRecall=false`，跳过 recall
4. 如果 `shouldRecall=true`，执行向量 recall
5. recall 结果注入 system prompt
6. 主模型开始生成回复

这个设计的优点是：

- recall 是否发生是条件化的
- recall 结果能在主模型生成前进入上下文
- recalled memories 能参与 `SOUL` runtime appraisal

但问题也很直接：

- 虽然不是每轮都做完整 recall，但几乎每轮都要先付出一次 LLM router 成本
- recall 决策本身变成了重路径
- 旧的 `memory_recall` span 把 gate 和 pre-recall 混在一起，语义不清晰
- 聊天系统的基础延迟被 memory router 拉高

---

## 2. 设计结论

新的 recall 设计不采用以下任何一种极端方案：

- 不采用“每轮都直接 recall”
- 不采用“完全依赖关键词规则”
- 不采用“完全把 recall 下放给聊天模型 tool”

新的目标方案是：

```text
cheap memory gate
  -> high-confidence pre-recall
  -> otherwise skip pre-recall
       -> let chat model use recall_memory tool if needed
```

也就是：

- **fast path**：cheap gate 识别高置信需要 recall 的 turn，前置 recall
- **fallback path**：cheap gate 没触发，但主模型在生成中发现缺上下文时，调用 `recall_memory` tool

---

## 3. 为什么不能只靠 tool recall

如果把 recall 完全改成 tool：

- recall 会发生在主模型生成阶段，而不是生成前
- recalled memories 无法参与 prompt assembly 的前置阶段
- recalled memories 无法参与当前轮 `SOUL` runtime 的 appraisal
- 第一轮生成时的 stance / tone / planning 仍可能在缺少历史上下文的情况下做出

因此：

- `recall_memory` tool 适合兜底
- 不适合替代所有 pre-recall

---

## 4. 为什么 cheap gate 不是“穷举关键词”

cheap gate 不追求覆盖所有 recall case。

它的目标是：

- **高 precision**
- **低成本**
- **允许漏掉一部分 case**

漏掉的 case 由 `recall_memory` tool 兜底。

所以 cheap gate 的职责不是“穷举所有语言表达”，而是：

- 抓住明显值得 recall 的 case
- 对不确定 case 保持克制
- 把不确定性留给主模型在运行时自我纠偏

---

## 5. 新架构

```text
User Message
  -> Memory Gate
       -> score high
            -> build recall query package
            -> pre-recall
            -> inject recalled memories into prompt
       -> score low / medium
            -> skip pre-recall
            -> chat model may call recall_memory tool

Chat Model
  -> if missing personal context
       -> call recall_memory tool
       -> continue generation
```

---

## 6. Memory Gate 设计

## 6.1 目标

memory gate 不使用 LLM。

它只使用 cheap signals：

- 当前 user message
- 最近少量 user turns
- unresolved memories 的轻量摘要
- recent memories 的轻量摘要

## 6.2 输入

```ts
type MemoryGateInput = {
  latestUserText: string;
  recentUserTexts: string[];
  unresolvedMemories: MemorySlice[];
  recentMemories: MemorySlice[];
};
```

其中：

```ts
type MemorySlice = {
  id: string;
  content: string;
  type: "event" | "thought" | "preference" | "fact" | "task";
  keywords: string[];
  unresolved: boolean;
  createdAt: string;
};
```

## 6.3 输出

```ts
type MemoryGateDecision = {
  shouldPreRecall: boolean;
  strategy: "pre_recall" | "tool_fallback" | "skip";
  score: number;
  reasons: string[];
  explicitReferenceScore: number;
  autobiographicalIntentScore: number;
  unresolvedMatchScore: number;
  recentMatchScore: number;
  continuityScore: number;
};
```

## 6.4 信号来源

memory gate 的 score 由多种弱信号组成，而不是单一关键词。

### A. 显式引用信号

高强度信号，例如：

- “你还记得”
- “上次”
- “之前”
- “remember”
- “last time”

这是高 precision 的强信号，但不要求覆盖全部 case。

### B. autobiographical intent

判断当前问题是否在问：

- 我的偏好
- 我的历史
- 我的计划
- 我的未完成事项

例如：

- “我是不是说过…”
- “我更喜欢哪个”
- “我上周定的计划呢”

### C. unresolved overlap

当前消息的 token / entity / keyword 与 unresolved memories 是否有明显重合。

### D. recent overlap

当前消息与 recent memories 是否有明显主题连续性。

### E. continuity signal

当前表达是否带有 follow-up / 回指特征，例如：

- 那个
- 这件事
- 后来呢
- then what happened

---

## 7. Memory Recall Query Builder

当 gate 判定需要 pre-recall 时，系统不再先问“关键词是什么”，而是构造一个 retrieval query package。

```ts
type MemoryRecallQuery = {
  rawQuery: string;
  expandedQuery: string;
  keywords: string[];
  targetPools: Array<"unresolved" | "recent" | "global">;
  expectedTypes: Array<"event" | "thought" | "preference" | "fact" | "task">;
};
```

### 7.1 rawQuery

当前用户原始消息。

### 7.2 expandedQuery

如果当前消息带有 continuity / 回指特征，可以把上一轮或最近两轮 user context 折叠进去，形成更完整的 retrieval query。

### 7.3 keywords

关键词只是辅助，不是 recall 的唯一入口。

来源：

- 当前消息里的核心 token / noun phrase
- 与 unresolved / recent memory 重合的关键词

### 7.4 targetPools

用于决定 recall 优先搜索哪些 memory slice。

例如：

- unresolved match 高：先看 `unresolved`
- continuity 高：优先 `recent`
- 默认始终保留 `global`

### 7.5 expectedTypes

帮助下游 recall 更聚焦地理解“这轮更像在找哪类记忆”。

例如：

- preference intent 高：`preference`, `fact`
- plan intent 高：`task`, `event`

---

## 8. Recall 执行策略

## 8.1 pre-recall

当 `MemoryGateDecision.shouldPreRecall = true`：

1. 用 `expandedQuery` 做 query embedding
2. 用 `keywords` 做辅助加权
3. 继续使用当前 `recall-pipeline`
4. recall 结果进入 prompt
5. recall 结果进入当前轮 `SOUL` runtime

## 8.2 tool fallback

当 `shouldPreRecall = false` 时：

- 不做前置 recall
- 但主模型拥有 `recall_memory` tool
- 如果主模型判断缺个人历史上下文，可以主动调用 tool

这部分承担的是：

- cheap gate 的漏网 case
- 生成中才暴露出来的上下文需求

---

## 9. `recall_memory` Tool 设计

## 9.1 目标

让主聊天模型在运行时补充 memory recall，而不把所有 recall 都放到 pre-recall。

## 9.2 输入

```ts
type RecallMemoryToolInput = {
  query: string;
  keywords?: string[];
  limit?: number;
};
```

## 9.3 输出

```ts
type RecallMemoryToolOutput = {
  recalled: boolean;
  query: string;
  keywords: string[];
  memories: Array<{
    id: string;
    content: string;
    type: string;
    keywords: string[];
    importance: number;
    similarity: number;
  }>;
};
```

## 9.4 语义

- tool 可以被主模型按需调用
- tool 调用失败不必然让整个 turn 失败
- tool 结果由模型自己消费并决定如何继续回复

---

## 10. Runtime Observability 调整

runtime observer 应把旧的单一 `memory_recall` 拆成：

- `retrieval_signals`
- `temporal_recall`

并记录：

- gate decision
- pre-recall 是否发生
- query package
- recalled memory count
- fallback strategy 是否可用

即便没有 pre-recall，也应该能在 timeline 里看到：

- `score`
- `strategy`
- `reasons`

这样 runtime timeline 才能解释：

- 为什么某轮没做 recall
- 为什么某轮前置 recall 了
- 为什么某轮是由 tool 兜底的

turn summary 层还应聚合：

- `memoryRecallStrategy`
- `preRecallCount`
- `hadToolRecall`

---

## 11. 实施方案

V1.1 最小实施方案：

1. 删除每轮 `runInstantDigestLLM`
2. 新增 `MemoryGate`
3. 新增 `MemoryRecallQueryBuilder`
4. 在 `chat-turn-service` 中：
   - 先跑 gate
   - 高分时做 pre-recall
   - 否则跳过 pre-recall
5. 新增 `recall_memory` server tool
6. runtime timeline 记录新的 gate / strategy 信息

---

## 12. 预期收益

完成 redesign 后，预期收益是：

- 大部分 turn 不再付出一次独立 LLM router 的耗时
- 真正高置信 case 仍能在生成前拿到记忆
- 边缘 case 由 tool 兜底
- runtime timeline 对 recall 行为更可解释

---

## 13. 完成标准

当满足以下条件时，可以认为 redesign 落地完成：

- 主链路中不再每轮调用 `runInstantDigestLLM`
- `retrieval_signals` 和 `temporal_recall` 的语义清晰可区分
- 高置信 recall case 仍能前置命中
- 模型可以通过 `recall_memory` tool 处理漏掉的 case
- tool failure 不阻断 turn 完成
