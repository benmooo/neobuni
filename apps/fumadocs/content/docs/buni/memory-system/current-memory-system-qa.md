---
title: "Current Memory System Q&A"
---

# Current Memory System Q&A

> 版本：1.0  
> 日期：2026-05-01  
> 状态：Current Implementation

---

## 0. 范围

这份文档回答“当前代码里 memory system 是怎么工作的”。

它描述的是当前实现，不是历史方案，也不是未来规划。

当前主链路在：

- `apps/server/src/ai/chat-turn-service.ts`
- `packages/core/src/domain/memory-gate.ts`
- `packages/core/src/cognition/retrieval-plan.ts`
- `apps/server/src/memory/temporal-memory-store.ts`
- `apps/server/src/memory/graph-memory-store.ts`
- `apps/server/src/memory/knowledge-store.ts`
- `packages/core/src/cognition/evidence-fusion.ts`
- `packages/core/src/cognition/working-memory.ts`

---

## 1. Q: `memory gate` 和 `retrieval planning` 是什么关系？

### A

它们是前后串联的两层，不是同一个概念。

### `memory gate`

职责是：

- 判断这一轮 user input 是否值得做 **temporal pre-recall**
- 给出一个便宜的、非 LLM 的 recall 置信度判断
- 产出一份基础 query package

它回答的问题是：

- “这一轮要不要先查一遍个人记忆”
- “如果不前查，是不是交给 tool fallback”

它的输出核心是：

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

以及：

```ts
type MemoryRecallQuery = {
  rawQuery: string;
  expandedQuery: string;
  keywords: string[];
  targetPools: Array<"unresolved" | "recent" | "global">;
  expectedTypes: Array<"event" | "thought" | "preference" | "fact" | "task">;
};
```

### `retrieval planning`

职责是：

- 基于 `MemoryGateDecision + MemoryRecallQuery + latestUserText`
- 判断应该查哪些 store
- 为每个 store 生成各自的查询计划

它回答的问题是：

- “除了 temporal 外，这轮要不要查 graph”
- “要不要查 knowledge”
- “graph / knowledge 各自用什么 query”

它的输出是：

```ts
type RetrievalPlan = {
  intent:
    | "personal_history"
    | "task_state"
    | "relationship_state"
    | "topic_continuity"
    | "world_knowledge"
    | "hybrid";
  reasons: Array<
    | "explicit_reference"
    | "topic_continuity"
    | "task_followup"
    | "relationship_lookup"
    | "world_knowledge"
    | "hybrid"
  >;
  stores: Array<"temporal" | "graph" | "knowledge">;
  temporalQuery: {
    query: string;
    keywords: string[];
    limit: number;
  } | null;
  graphQuery: {
    seedTerms: string[];
    relationTypes: string[];
    maxDepth: number;
    limit: number;
  } | null;
  knowledgeQuery: {
    query: string;
    keywords: string[];
    limit: number;
  } | null;
};
```

### 简化理解

- `memory gate`：先判断“要不要前查记忆”
- `retrieval planning`：再决定“具体查哪些记忆层、怎么查”

所以：

- `memory gate` 更像 recall admission control
- `retrieval planning` 更像 multi-store query planner

---

## 2. Q: 现在的 `memory gate` 是什么逻辑？和旧的 heuristic 关键字检测有什么区别？

### A

当前 `memory gate` 仍然是 heuristic-based，但已经不是“单纯关键词命中就查”。

它是一个 **多弱信号加权打分器**。

### 当前输入

```ts
type MemoryGateInput = {
  latestUserText: string;
  recentUserTexts: string[];
  unresolvedMemories: MemorySlice[];
  recentMemories: MemorySlice[];
};
```

这里的 `unresolvedMemories` 和 `recentMemories` 都不是完整 recall 结果，而是轻量 memory slices。

也就是说，gate 之前就已经有两层轻量 surface：

- unresolved carryover
- recent continuity

这个你之前的理解是对的，而且现在仍然保留。

### 当前打分信号

当前 `buildMemoryGateDecision()` 主要看 5 类信号：

1. `explicitReferenceScore`
   - 例如：
   - `remember`
   - `last time`
   - `之前`
   - `上次`
   - `还记得`
   - `我们聊过`

2. `autobiographicalIntentScore`
   - 用户是不是在问自己的偏好、历史、计划、待办
   - 例如：
   - `喜欢`
   - `偏好`
   - `计划`
   - `提醒`
   - `是不是说过`

3. `unresolvedMatchScore`
   - 当前 query token 和 unresolved memories 的 keyword/content token overlap

4. `recentMatchScore`
   - 当前 query token 和 recent memories 的 overlap

5. `continuityScore`
   - 当前消息是否像 follow-up / 回指
   - 例如：
   - `that`
   - `it`
   - `那个`
   - `这件事`
   - `后来`

### 当前决策逻辑

当前是一个加权分数：

```ts
score = max(
  explicitReferenceScore,
  weightedScore(
    explicitReferenceScore,
    autobiographicalIntentScore,
    unresolvedMatchScore,
    recentMatchScore,
    continuityScore,
  ),
);
```

然后分成 3 档：

- `score >= 0.72`
  - `strategy = "pre_recall"`
- `0.35 <= score < 0.72`
  - `strategy = "tool_fallback"`
- `score < 0.35`
  - `strategy = "skip"`

### 和旧方案的关键区别

旧理解更接近：

- 命中某些关键词
- 激活 temporal cortex recall
- 然后 recall + rerank + unresolved/recent surfacing

现在更准确地说是：

1. unresolved/recent 轻量 surface 先参与 gate
2. gate 不只看显式关键词，还看 overlap 和 continuity
3. gate 的结果不是二元 yes/no，而是三态：
   - `pre_recall`
   - `tool_fallback`
   - `skip`
4. gate 直接产出 `MemoryRecallQuery`
5. 之后再进入 `retrieval planning`

所以当前 `memory gate` 已经是：

- heuristic
- cheap
- multi-signal
- tri-state

而不是“简单关键词命中器”。

---

## 3. Q: 现在的 `hippocampus` 层是如何设计的？

## 3.a Q: 它的存在形式是什么？是图数据库吗？

### A

当前 `hippocampus` 不是独立图数据库服务。

它当前是：

- **SQLite 上的 graph tables**
- 配合 Drizzle repo 查询
- 逻辑上扮演 graph memory store

核心表是：

- `memory_graph_nodes`
- `memory_graph_edges`
- `memory_graph_sources`

也就是说：

- 是图结构
- 但不是 Neo4j / Kuzu 这种独立图引擎
- 当前实现形态是 “SQLite graph layer”

### 当前 schema 语义

#### `memory_graph_nodes`

存节点，例如：

- topic
- event
- task
- entity

当前 repo 里的 node kind 以这几类为主：

```ts
type MemoryGraphNodeKind = "topic" | "entity" | "event" | "task";
```

#### `memory_graph_edges`

存边，例如：

- `about`
- `prefers`
- `states`
- `related_to`

#### `memory_graph_sources`

存证据来源，用来回答：

- 这个 node / edge 为什么存在
- 它来自哪条 memory / message / knowledge source

所以当前 hippocampus 不是“纯图谱幻想层”，而是有 provenance 的可追溯图层。

## 3.b Q: 触发 hippocampus recall 的机制是什么？

### A

不是单独的 graph gate。

当前触发机制是：

1. 先跑 `memory gate`
2. 再跑 `retrieval planning`
3. `retrieval planning` 决定是否生成 `graphQuery`
4. 只有 `graphQuery !== null` 时才会执行 `graph_recall`

### 当前 planner 对 graph 的触发条件

`createRetrievalPlan()` 里，`shouldUseGraph` 为真时会生成 `graphQuery`。

当前主要条件是：

- `decision.shouldPreRecall === true`
- 或 `intent === "personal_history"`
- 或 `intent === "relationship_state"`
- 或 `intent === "task_state"`
- 或 `intent === "topic_continuity"`

所以 graph recall 的触发更偏语义 intent，而不是单独关键词。

### 典型会触发 graph 的问题

- 问关系：谁和谁什么关系
- 问个人历史：我们之前聊过什么
- 问任务状态：之前那个计划怎么样了
- 问主题连续性：那个后来呢

## 3.c Q: 它依赖 temporal cortex recall 的结果吗？它们是什么关系？

### A

**不直接依赖 temporal recall 的结果。**

当前关系是：

- temporal recall 和 graph recall 都由同一个 `RetrievalPlan` 驱动
- 它们在 orchestrator 里是并列的 store-specific recall
- graph recall 不读取 temporal recall 的输出作为输入

更准确地说：

- 二者共享同一个上游：
  - `MemoryGateDecision`
  - `MemoryRecallQuery`
  - `RetrievalPlan`
- 但 graph recall 用的是自己的 `graphQuery`
- temporal recall 用的是自己的 `temporalQuery`

### 什么时候看起来像“依赖”？

间接上它们是有关联的：

- `memory gate` 的 `shouldPreRecall` 会影响 planner 是否更倾向启用 graph
- `intent` 与 `reasons` 同时影响 temporal / graph / knowledge 的 activation

但这不是“graph 吃 temporal 的结果”，而是：

- **shared planning**
- **parallel recall**
- **downstream fusion**

## 3.d Q: 它被激活时，输入输出的数据结构是什么？

### A

### 输入

当前 `graph-memory-store.ts` 的输入是：

```ts
type GraphRecallInput = {
  profileId: string;
  plan: RetrievalPlan;
};
```

其中真正使用的是：

```ts
type GraphQuery = {
  seedTerms: string[];
  relationTypes: string[];
  maxDepth: number;
  limit: number;
};
```

### 过程

graph recall 过程大致是：

1. `searchMemoryGraphNodes()`
   - 用 `seedTerms` 搜 seed nodes
2. `listMemoryGraphEdgesForNodeIds()`
   - 从 seed nodes 往外取边
3. `getMemoryGraphNodesByIds()`
   - 把邻接节点补全
4. `listMemoryGraphSourcesForTargetIds()`
   - 补 provenance
5. 组装成 `EvidenceItem[]`

### 输出

输出不是图对象，而是 evidence：

```ts
type GraphRecallResult = {
  store: "graph";
  items: EvidenceItem[];
  stats: {
    seedNodeCount: number;
    traversedEdgeCount: number;
    returnedItemCount: number;
  };
};
```

其中 `items` 里会混合两类 evidence：

- node evidence
- relation evidence

例如：

```ts
type EvidenceItem = {
  id: string;
  store: "temporal" | "graph" | "knowledge";
  kind: "memory" | "entity" | "event" | "task" | "fact" | "chunk" | "relation";
  title: string | null;
  content: string;
  score: number;
  confidence: number | null;
  recency: number | null;
  retrievalReason: RetrievalReason;
  provenance: {
    sourceType: "message" | "memory" | "knowledge_chunk" | "document" | "manual";
    sourceId: string;
    citationLabel?: string;
  };
  metadata: Record<string, unknown>;
};
```

所以 hippocampus 层的输出不是“图”，而是“可融合的 graph-derived evidence items”。

---

## 4. Q: 现在的 `world knowledge` 是如何设计的？它的触发机制是什么？它和 temporal / hippocampus 是什么关系？

### A

当前 `world knowledge` 也是独立 store，不是 temporal 或 graph 的附属层。

它的存储形态是：

- `knowledge_documents`
- `knowledge_chunks`
- `knowledge_facts`
- 以及辅助索引：
  - `vec_knowledge_chunks`
  - `fts_knowledge_chunks`

### 它的触发机制

和 graph 一样，不是单独的 knowledge gate。

它也是由 `retrieval planning` 决定的。

当前 planner 里，`shouldUseKnowledge` 为真时会生成 `knowledgeQuery`。

主要条件是：

- `intent === "world_knowledge"`
- 或 `intent === "hybrid" && !decision.shouldPreRecall`

所以知识库更偏向这两类情况：

1. 用户在问概念、原理、解释、区别
2. 当前轮不像是强个人记忆问题，但又像混合检索问题

### 它和 temporal / graph 的关系

它们是：

- 同级 store
- 共享 planner
- 并行 recall
- 下游统一做 evidence fusion

不是：

- knowledge 依赖 temporal
- knowledge 依赖 graph
- temporal recall 失败才查 knowledge

### 当前 recall 过程

knowledge recall 是 hybrid 的：

1. 关键词检索
   - `searchKnowledgeChunkText()`
2. fallback 文本检索
   - `searchKnowledgeChunkTextFallback()`
3. 向量检索
   - `searchSimilarKnowledgeChunks()`
4. fact 检索
   - `searchKnowledgeFacts()`
5. 把 chunk 和 fact 统一映射成 `EvidenceItem[]`

### 输入

```ts
type KnowledgeRecallInput = {
  profileId: string;
  plan: RetrievalPlan;
  embeddingConfig?: OpenAICompatibleConfig | null;
};
```

其中真正使用的是：

```ts
type KnowledgeQuery = {
  query: string;
  keywords: string[];
  limit: number;
};
```

### 输出

```ts
type KnowledgeRecallResult = {
  store: "knowledge";
  items: EvidenceItem[];
  stats: {
    keywordHitCount: number;
    vectorHitCount: number;
    returnedItemCount: number;
  };
};
```

### 关系总结

- temporal：像不像之前经历过
- hippocampus / graph：谁和谁、什么关系、什么链条
- world knowledge：这个概念/文档知识是什么

当前三者是并行 source，不是级联 fallback。

---

## 5. Q: `memory fusion` / `evidence fusion` 是怎么设计的？它的输入输出结构是什么？结果就是 `working memory` 吗？

### A

当前实现里可以把它拆成两步：

1. `evidence fusion`
2. `working memory build`

它们不是同一步。

## 5.1 `memory fusion` / `evidence fusion` 做了什么？

当前 orchestrator 里，`buildMemoryFusionResult()` 会做三件事：

1. 把 temporal recalled memories 映射成 `EvidenceItem[]`
2. 把 temporal / graph / knowledge evidence 合并排序去重
3. 用 fused evidence 构建 `WorkingMemory`

### 当前输入

```ts
type MemoryFusionInput = {
  temporalMemories: RecalledMemory[];
  graphEvidence?: EvidenceItem[];
  knowledgeEvidence?: EvidenceItem[];
  retrievalReason: RetrievalReason;
};
```

### 第一步：temporal -> evidence

temporal memory 先映射为统一证据格式：

```ts
type TemporalRecalledMemory = {
  id?: string;
  content: string;
  type: string;
  keywords: string[];
  importance?: number;
  similarity?: number;
  sourceTier?: "vector_hit" | "unresolved_carryover" | "recent_continuity";
  unresolved?: boolean;
};
```

映射之后都变成 `EvidenceItem`。

### 第二步：evidence fusion

当前 `fuseEvidenceItems()` 很朴素：

- 把 temporal / graph / knowledge evidence 拼起来
- 按 `score desc` 排序
- 用下面这个 key 去重：

```ts
`${item.store}:${item.provenance.sourceId}:${item.kind}:${item.content}`
```

也就是说，当前 fusion 机制不是复杂推理器，而是：

- normalize to common evidence schema
- rank
- dedupe

## 5.2 evidence fusion 的输出是什么？

严格说，evidence fusion 的直接输出是：

```ts
type FusedEvidence = EvidenceItem[];
```

在 `buildMemoryFusionResult()` 里，这个字段就是：

```ts
type MemoryFusionResult = {
  temporalEvidence: EvidenceItem[];
  fusedEvidence: EvidenceItem[];
  workingMemory: WorkingMemory;
};
```

所以：

- `fusedEvidence` 是 evidence fusion 的直接结果
- `workingMemory` 是下一步 build 的结果

## 5.3 `working memory` 是怎么 build 的？

当前 `buildWorkingMemory()` 的逻辑是分桶，不是复杂 planner。

它把 `fusedEvidence` 分成：

- `personalContext`
  - temporal 且非 task
- `relationshipContext`
  - graph，或者 retrieval reason 是 `relationship_lookup`
- `taskContext`
  - `kind === "task"`
- `worldContext`
  - `store === "knowledge"`

然后再派生：

- `openLoops`
  - task 里 unresolved 的项
- `userIntent`
  - 有 task context -> `plan`
  - 否则有 personal context -> `recall`
  - 否则 -> `ask`
- `actionCandidates`
  - 当前只有 task 情况下给 `resolve_open_task_context`

### 输出结构

```ts
type WorkingMemory = {
  userIntent: "ask" | "recall" | "plan" | "reflect" | "act";
  personalContext: EvidenceItem[];
  relationshipContext: EvidenceItem[];
  taskContext: EvidenceItem[];
  worldContext: EvidenceItem[];
  openLoops: Array<{
    id: string;
    summary: string;
    sourceStore: "temporal" | "graph" | "knowledge";
  }>;
  constraints: string[];
  actionCandidates: string[];
};
```

### 结论

所以答案是：

- `evidence fusion` 的结果 **不是** `working memory`
- `evidence fusion` 的结果是 `fusedEvidence`
- `working memory` 是在 `fusedEvidence` 基础上再做一层结构化分桶和派生

---

## 6. 当前整体流程图

```text
latest user text
  -> memory gate
  -> memory recall query
  -> retrieval plan
       -> temporal recall (conditional pre-recall)
       -> graph recall
       -> knowledge recall
  -> evidence fusion
  -> working memory build
  -> soul runtime / prompt build
```

其中有一个很重要的现实：

- temporal recall 会被 `memory gate.shouldPreRecall` 控制
- graph recall / knowledge recall 主要由 `retrieval plan` 决定

所以现在系统不是“只有 gate 通过才有任何 recall”，而是：

- temporal pre-recall 由 gate 控制
- multi-store activation 由 planner 控制

---

## 7. 一句话总结

- `memory gate` 决定 temporal pre-recall 要不要做
- `retrieval planning` 决定 temporal / graph / knowledge 哪些 store 要参与
- `temporal cortex` 是向量相似 + unresolved/recent surfacing
- `hippocampus` 是 SQLite graph layer，输出 graph evidence，不直接依赖 temporal recall 结果
- `world knowledge` 是 document/chunk/fact 混合检索层，和 temporal / graph 是并列关系
- `evidence fusion` 先统一证据、排序、去重
- `working memory` 是对 fused evidence 再做结构化分桶后的 runtime 产物
