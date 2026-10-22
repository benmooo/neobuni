---
title: "Retrieval Policy Redesign"
---

# Retrieval Policy Redesign

> Status: Active design
> Date: 2026-05-02
> Companion docs:
>
> - [memory-system-v2.md](./memory-system-v2.md)
> - [memory-recall-redesign.md](./memory-recall-redesign.md)
> - [diagrams/memory-retrieval-pipeline-dataflow.md](./diagrams/memory-retrieval-pipeline-dataflow.md)

---

## 1. Purpose

This document replaces the muddled `memory gate + retrieval plan` mental model with a cleaner retrieval policy pipeline.

The immediate goal is not to redesign storage. The goal is to fix the runtime decision boundary before the retrieval layer gets any deeper.

The current issue is simple:

- `memory gate` is nominally about temporal pre-recall
- `retrieval plan` also makes graph and knowledge activation decisions
- graph intent inference currently borrows signals from temporal gate output
- runtime execution reads temporal from `memoryGateDecision` and graph or knowledge from `retrievalPlan`

That shape is hard to reason about because the system suggests a dependency that does not actually exist.

Temporal recall currently executes first, but graph recall and knowledge recall do not consume temporal recall output.

---

## 2. Design Goals

We want the retrieval layer to satisfy four rules:

1. Signal extraction is not store activation.
2. Intent classification is not query building.
3. Store activation is symmetrical across temporal, graph, and knowledge.
4. Execution consumes one unified plan.

This keeps the functional core explicit:

```text
TurnContext
  -> RetrievalSignals
  -> RetrievalIntentProfile
  -> StoreActivationPlan
  -> StoreQuerySet
  -> RetrievalPlan
```

The server shell then only executes the plan:

```text
RetrievalPlan
  -> store-specific recall
  -> RetrievedEvidence
```

---

## 3. What Is Wrong With The Current Shape

Today the system effectively does this:

```text
TurnContext
  -> MemoryGateDecision
  -> MemoryRecallQuery
  -> RetrievalPlan
```

The problem is not that these steps exist. The problem is the boundary placement.

### 3.1 `MemoryGateDecision` is doing temporal admission control

This part is valid.

It decides whether temporal recall should be:

- `pre_recall`
- `tool_fallback`
- `skip`

### 3.2 `RetrievalPlan` is overloaded

It currently does all of the following:

- infer retrieval intent
- decide whether graph recall should happen
- decide whether knowledge recall should happen
- repackage temporal query
- hold final store query objects

### 3.3 Graph activation borrows temporal semantics

Graph recall is currently enabled partly from:

- `decision.shouldPreRecall`
- `decision.explicitReferenceScore`
- `decision.continuityScore`

This creates the wrong mental model.

The system starts to look like:

```text
temporal gate
  -> graph decision
```

But that is not real. Graph recall does not depend on temporal recall output.

### 3.4 Execution is split-brain

`runRetrieval()` currently reads:

- temporal execution from `memoryGateDecision`
- temporal query material from `memoryRecallQuery`
- graph and knowledge execution from `retrievalPlan`

That means the execution layer does not have one source of truth.

---

## 4. New Retrieval Policy Pipeline

The new pipeline is:

```text
TurnContext
  -> buildRetrievalSignals
  -> classifyRetrievalIntents
  -> planStoreActivation
  -> buildStoreQueries
  -> buildRetrievalPlan
  -> executeRetrievalPlan
```

This keeps the stages narrow and composable.

---

## 5. Stage 1: Retrieval Signals

This stage extracts cheap, store-agnostic signals.

It does not decide whether any store should execute.

Suggested shape:

```ts
type RetrievalSignals = {
  explicitPersonalReferenceScore: number;
  autobiographicalIntentScore: number;
  continuityScore: number;
  unresolvedOverlapScore: number;
  recentOverlapScore: number;
  relationshipLookupScore: number;
  taskFollowupScore: number;
  worldKnowledgeScore: number;
  topicTerms: string[];
  entityTerms: string[];
};
```

### Responsibilities

- normalize text
- extract keywords and lightweight entities
- score coarse retrieval-relevant cues
- stay independent from store activation policy

### Non-responsibilities

- no `prefetch / defer / skip`
- no store-specific limits
- no graph or knowledge query objects

---

## 6. Stage 2: Retrieval Intent Profile

This stage turns signals into an intent distribution.

Suggested shape:

```ts
type RetrievalIntentProfile = {
  personalHistory: number;
  relationshipState: number;
  taskState: number;
  topicContinuity: number;
  worldKnowledge: number;
};
```

And a downstream primary intent:

```ts
type RetrievalIntent =
  | "personal_history"
  | "relationship_state"
  | "task_state"
  | "topic_continuity"
  | "world_knowledge"
  | "hybrid";
```

### Important rule

Graph intent should be derived from shared retrieval signals, not from temporal recall execution state.

That means:

- graph activation may correlate with personal history
- graph activation must not be conceptually downstream of temporal pre-recall

---

## 7. Stage 3: Store Activation Plan

This is the real gate layer.

Every store gets the same shape:

```ts
type RetrievalActivationMode = "prefetch" | "defer_to_tool" | "skip";

type StoreActivationDecision = {
  mode: RetrievalActivationMode;
  score: number;
  reasons: string[];
};

type StoreActivationPlan = {
  temporal: StoreActivationDecision;
  graph: StoreActivationDecision;
  knowledge: StoreActivationDecision;
};
```

### Why this matters

This removes the asymmetry where temporal has a visible gate but graph and knowledge only have hidden planner logic.

### Policy direction

#### Temporal

- `prefetch` when personal-history or task-state need is high
- `defer_to_tool` when personal need is ambiguous
- `skip` when weak

#### Graph

- `prefetch` when relationship-state, task-state, or topic-continuity need is high
- `defer_to_tool` when moderate
- `skip` when weak

#### Knowledge

- `prefetch` when world-knowledge need is high
- `defer_to_tool` when moderate
- `skip` when weak

This is the key cleanup:

- temporal is no longer special in shape
- temporal is only special in threshold and downstream importance

---

## 8. Stage 4: Store Queries

Query building now happens after activation planning.

Suggested shape:

```ts
type TemporalRetrievalQuery = {
  query: string;
  keywords: string[];
  targetPools: Array<"unresolved" | "recent" | "global">;
  expectedTypes: Array<"event" | "thought" | "preference" | "fact" | "task">;
  limit: number;
};

type GraphRetrievalQuery = {
  seedTerms: string[];
  relationTypes: string[];
  maxDepth: number;
  limit: number;
};

type KnowledgeRetrievalQuery = {
  query: string;
  keywords: string[];
  limit: number;
};

type StoreQuerySet = {
  temporal: TemporalRetrievalQuery | null;
  graph: GraphRetrievalQuery | null;
  knowledge: KnowledgeRetrievalQuery | null;
};
```

### Rule

`prefetch` leads to a concrete prefetch query.

`defer_to_tool` does not execute prefetch, but still preserves enough reasoning metadata for later tool use or observability.

---

## 9. Stage 5: Unified Retrieval Plan

Suggested shape:

```ts
type RetrievalPlan = {
  primaryIntent: RetrievalIntent;
  intentProfile: RetrievalIntentProfile;
  activation: StoreActivationPlan;
  queries: StoreQuerySet;
  reasons: RetrievalReason[];
  stores: Array<"temporal" | "graph" | "knowledge">;
};
```

This becomes the single source of truth for execution.

---

## 10. Execution Semantics

The server shell should stop reading temporal execution state from a separate gate object.

Instead:

```text
if retrievalPlan.queries.temporal exists
  -> run temporal recall

if retrievalPlan.queries.graph exists
  -> run graph recall

if retrievalPlan.queries.knowledge exists
  -> run knowledge recall
```

The runtime observer may still keep a temporal-specific summary field such as `memoryRecallStrategy`, but that should be derived from:

```ts
retrievalPlan.activation.temporal.mode;
```

not from a separate decision object.

---

## 11. Ordering and Parallelism

By default, store execution should be logically independent.

That means:

- temporal does not feed graph in the base plan
- temporal does not feed knowledge in the base plan
- graph does not feed knowledge in the base plan

The clean baseline is:

```text
buildRetrievalPlan
  -> parallel store recall
  -> fuse evidence
```

If we later want two-phase retrieval, for example:

```text
phase 1 temporal recall
  -> derive graph seed expansion
  -> phase 2 graph recall
```

that must be an explicit future feature, not an implicit coupling hidden in planner heuristics.

---

## 12. Transitional Implementation Plan

We do not need a flag day rewrite.

### Phase 1

- keep the existing runtime spans:
  - `retrieval_signals`
  - `retrieval_plan`
  - `temporal_recall`
  - `graph_recall`
  - `knowledge_recall`
- introduce a new pure planning pipeline
- keep `memoryRecallStrategy` on runtime turns as a temporal-only summary

### Phase 2

- keep `retrieval_signals` as the canonical pre-plan signal stage
- keep `temporal_recall` as the canonical temporal prefetch stage
- expose `graph` and `knowledge` activation summaries explicitly in runtime spans

### Phase 3

- optionally remove old transitional exports and terminology

---

## 13. Immediate Refactor Target

The first code cut should aim for this structure:

```text
packages/core/src/cognition/
  retrieval-signals.ts
  retrieval-intent.ts
  retrieval-activation.ts
  retrieval-queries.ts
  retrieval-plan.ts
```

And this runtime integration:

```text
apps/server/src/runtime/run-retrieval.ts
  -> const retrievalPlan = buildRetrievalPlan(turnContext)
  -> execute retrievalPlan only
```

The key success condition is:

The runtime no longer needs a split between:

- "temporal gate state"
- "retrieval planner state"

It should only need:

- one retrieval plan
- one execution path

---

## 14. Summary

The redesign is conceptually simple:

- signals are shared
- intents are classified once
- every store has an explicit activation decision
- queries are built after activation
- execution consumes a single plan

This removes the current ambiguity where graph recall seems to be downstream of temporal gate logic even though no such data dependency exists.
