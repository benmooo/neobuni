---
title: "Buni Runtime Kernel Implementation Plan"
---

# Buni Runtime Kernel Implementation Plan

> Status: Active implementation plan
> Date: 2026-05-02
> Companion doc: [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
> Runtime diagram: [`./core-layer/diagrams/chat-turn-runtime-pipeline.md`](./core-layer/diagrams/chat-turn-runtime-pipeline.md)
> Perception doc: [`./perception-layer/perception-signal-adapters-v1.md`](./perception-layer/perception-signal-adapters-v1.md)
> Reflection doc: [`./perception-layer/reflection-system-architecture.md`](./perception-layer/reflection-system-architecture.md)
> Reflection contracts doc: [`./perception-layer/reflection-contracts-and-storage.md`](./perception-layer/reflection-contracts-and-storage.md)
> Expression doc: [`./expression-layer/expression-compiler-contract-v1.md`](./expression-layer/expression-compiler-contract-v1.md)

## 1. Purpose

This document translates the refactor draft into executable work packages.

It answers:

- what we change first
- which files are affected
- which abstractions are transitional
- what "done" looks like for each phase

This plan assumes:

- we keep one canonical chat turn runtime
- we prefer structural cleanup over compatibility
- we keep pure logic in `packages/core`
- we keep I/O, persistence, providers, and tools in `apps/server`

## 2. Current Canonical Runtime

Today the effective chat turn path is:

1. [`apps/server/src/routes/chat.ts`](../apps/server/src/routes/chat.ts)
2. [`apps/server/src/runtime/create-chat-turn-stream.ts`](../apps/server/src/runtime/create-chat-turn-stream.ts)
3. memory and retrieval modules in `apps/server/src/memory/*`
4. pure decision modules in `packages/core/src/*`
5. runtime observation in [`apps/server/src/runtime/runtime-observer.ts`](../apps/server/src/runtime/runtime-observer.ts)

Transitional or ambiguous pieces:

- historical re-export structure in `packages/contracts/src/index.ts`
- prompt helper surface in [`packages/core/src/prompt/chat-helpers.ts`](../packages/core/src/prompt/chat-helpers.ts)

## 3. Refactor Strategy

We should not try to rewrite the whole runtime in one move.

The safe sequence is:

1. remove ambiguity
2. add the missing contracts
3. extract pure kernel composition
4. move the server shell onto the new kernel
5. redesign working memory after the kernel boundary exists

This sequence matters. If we redesign `WorkingMemory` before the runtime split is clear, the change will sprawl across persistence, prompting, and streaming code at once.

## 4. Work Packages

## Phase 0: Runtime Truth Cleanup

### Goal

Make the current runtime path explicit and remove conceptual duplicates before introducing new abstractions.

### Scope

- documentation alignment
- runtime contract cleanup
- old-path deprecation

### Files

Primary:

- [`ARCHITECTURE.md`](../ARCHITECTURE.md)
- [`docs/runtime-kernel-implementation-plan.md`](./runtime-kernel-implementation-plan.md)
- [`docs/expression-layer/expression-renderer-contract-v1.md`](./expression-layer/expression-renderer-contract-v1.md)
- [`apps/server/src/runtime/create-chat-turn-stream.ts`](../apps/server/src/runtime/create-chat-turn-stream.ts)
- [`apps/server/src/providers/provider-stream-outcome.ts`](../apps/server/src/providers/provider-stream-outcome.ts)
- [`apps/server/src/providers/provider-stream-outcome.test.ts`](../apps/server/src/providers/provider-stream-outcome.test.ts)

### Tasks

1. Ensure route-level documentation and comments identify `create-chat-turn-stream.ts` as the canonical runtime path.
2. Keep provider stream outcome behavior isolated under `providers/`.
3. Fix `provider-stream-outcome` tests so runtime observability contract matches implementation.
4. Keep `ARCHITECTURE.md` and this plan linked.

### Done when

- only one chat turn runtime path is considered canonical
- tests for provider stream outcome pass
- no one reading the repo has to guess which runtime path is real

## Phase 1: Introduce Missing Contracts

### Goal

Add the contracts required for a cleaner runtime kernel before refactoring orchestration.

### New contracts

Suggested files:

```text
packages/contracts/src/runtime/signal.ts
packages/contracts/src/runtime/response.ts
packages/contracts/src/runtime/turn-context.ts
packages/contracts/src/runtime/prompt.ts
```

### Proposed types

`signal.ts`

```ts
type Signal =
  | TextSignal
  | MemorySignal
  | ScheduleSignal
  | BehavioralSignal
  | EnvironmentalSignal;

type SignalSet = {
  textSignals: TextSignal[];
  memorySignals: MemorySignal[];
  scheduleSignals: ScheduleSignal[];
  behavioralSignals: BehavioralSignal[];
  environmentalSignals: EnvironmentalSignal[];
};
```

`response.ts`

```ts
type ResponseSpec = {
  goal: "stay_present" | "soothe" | "clarify" | "guard" | "gently_mobilize";
  stance: Stance;
  tone: string[];
  mustAvoid: string[];
  intimacyCap: string;
  verbosity: "low" | "medium" | "high";
  shouldAskFollowup: boolean;
  shouldSuggestAction: boolean;
  toolPolicy: "avoid" | "allow" | "prefer";
};
```

`turn-context.ts`

```ts
type TurnContext = {
  input: TurnInput;
  signals: SignalSet;
  unresolvedSlices: MemorySlice[];
  recentSlices: MemorySlice[];
  previousRuntimeState: PreviousRuntimeState | null;
};
```

### Existing files to update

- [`packages/contracts/src/index.ts`](../packages/contracts/src/index.ts)
- [`packages/contracts/src/runtime/turn.ts`](../packages/contracts/src/runtime/turn.ts)
- [`packages/contracts/src/cognition-layer/memory-system.ts`](../packages/contracts/src/cognition-layer/memory-system.ts)

### Tasks

1. Add signal and response contracts.
2. Export them from the root contract surface.
3. Keep old contract names stable only where needed for local migration.
4. Do not move server logic yet.

### Done when

- `packages/core` can depend on runtime signal and response types without inventing ad hoc local types
- the future kernel has a stable contract surface

## Phase 2: Extract Pure Runtime Kernel

### Goal

Move orchestration decisions into a small set of pure composition functions in `packages/core`.

### Target files

Suggested new structure:

```text
packages/core/src/runtime/
  build-turn-context.ts
  build-signal-set.ts
  build-soul-decision.ts
  build-response-spec.ts
  run-turn-kernel.ts
```

Suggested supporting structure:

```text
packages/core/src/prompt/
  compile-system-prompt.ts
```

### Existing files involved

- [`packages/core/src/soul/soul-runtime.ts`](../packages/core/src/soul/soul-runtime.ts)
- [`packages/core/src/cognition/memory-gate.ts`](../packages/core/src/cognition/memory-gate.ts)
- [`packages/core/src/cognition/retrieval-plan.ts`](../packages/core/src/cognition/retrieval-plan.ts)
- [`packages/core/src/cognition/evidence-fusion.ts`](../packages/core/src/cognition/evidence-fusion.ts)
- [`packages/core/src/cognition/working-memory.ts`](../packages/core/src/cognition/working-memory.ts)
- [`packages/core/src/prompt/chat-helpers.ts`](../packages/core/src/prompt/chat-helpers.ts)

### Extraction rules

1. Keep stage functions pure.
2. Pass data explicitly, no hidden access to DB or environment.
3. Preserve current heuristics first, improve them later.
4. Move text prompt generation behind a compiler-style boundary.

### Proposed composition

```ts
type KernelInput = {
  turnContext: TurnContext;
  recalledEvidence: RetrievedEvidence;
  soulConfig: SoulConfig;
};

type KernelOutput = {
  retrievalPlan: RetrievalPlan;
  workingMemory: WorkingMemory;
  soulDecision: SoulDecision;
  responseSpec: ResponseSpec;
  systemPrompt: string;
};
```

### Tasks

1. Extract `SoulDecision` from current `buildSoulRuntimeState()`.
2. Extract `ResponseSpec` from current response planning logic.
3. Move prompt text assembly into `compile-system-prompt.ts`.
4. Keep current prompt wording mostly stable during extraction.

### Done when

- a pure top-level `run-turn-kernel()` exists in `packages/core`
- server orchestration can call it with plain input data
- prompt building is downstream of kernel output, not upstream

## Phase 3: Split the Server Runtime Shell

### Goal

Make the server runtime shell small and composable by separating loading, retrieval, provider setup, and persistence.

### Target files

Suggested structure:

```text
apps/server/src/runtime/
  create-chat-turn-stream.ts
  load-turn-context.ts
  run-retrieval.ts
  compile-provider-request.ts
  persist-turn-result.ts
  runtime-observer.ts
```

### Existing files involved

- [`apps/server/src/routes/chat.ts`](../apps/server/src/routes/chat.ts)
- [`apps/server/src/runtime/create-chat-turn-stream.ts`](../apps/server/src/runtime/create-chat-turn-stream.ts)
- [`apps/server/src/runtime/runtime-observer.ts`](../apps/server/src/runtime/runtime-observer.ts)
- [`apps/server/src/memory/temporal-memory-store.ts`](../apps/server/src/memory/temporal-memory-store.ts)
- [`apps/server/src/memory/graph-memory-store.ts`](../apps/server/src/memory/graph-memory-store.ts)
- [`apps/server/src/memory/knowledge-store.ts`](../apps/server/src/memory/knowledge-store.ts)

### Split rules

1. `load-turn-context.ts` loads persisted data and lightweight slices.
2. `run-retrieval.ts` owns temporal, graph, and knowledge store calls.
3. `compile-provider-request.ts` maps kernel output to provider input.
4. `create-chat-turn-stream.ts` owns streaming, tool wiring, and finalization.
5. `create-chat-turn-stream.ts` remains the runtime shell while more shell helpers are extracted around it.

### Tasks

1. Move context loading out of the main runtime shell.
2. Move retrieval side effects into a retrieval runner module.
3. Move provider request shaping into its own module, consuming a structured prompt packet rather than a bare prompt string.
4. Keep runtime observer integrated through every stage.

### Done when

- no single server runtime file owns the full turn flow
- runtime shell modules each have one side-effect responsibility
- the route points to one obvious entrypoint

## Phase 4: Redesign Working Memory

### Goal

Upgrade `WorkingMemory` from grouped evidence to bounded cognitive state.

### Current issue

Today:

- `personalContext`, `relationshipContext`, `taskContext`, and `worldContext` are mostly grouped by store or item kind
- `userIntent` is thin
- `constraints` and `actionCandidates` are underused

### Target shape

Suggested replacement direction:

```ts
type WorkingMemory = {
  relationshipState: EvidenceItem[];
  emotionalState: EvidenceItem[];
  personalContext: EvidenceItem[];
  activeTasks: EvidenceItem[];
  openLoops: OpenLoop[];
  worldFacts: EvidenceItem[];
  constraints: ConstraintItem[];
  actionCandidates: ActionCandidate[];
};
```

### Files involved

- [`packages/contracts/src/cognition-layer/memory-system.ts`](../packages/contracts/src/cognition-layer/memory-system.ts)
- [`packages/core/src/cognition/working-memory.ts`](../packages/core/src/cognition/working-memory.ts)
- [`packages/core/src/cognition/memory-fusion.ts`](../packages/core/src/cognition/memory-fusion.ts)
- [`packages/core/src/prompt/chat-helpers.ts`](../packages/core/src/prompt/chat-helpers.ts)

### Tasks

1. Define semantic slots first in contracts.
2. Map fused evidence into slots by role, not only by source store.
3. Preserve provenance and scores.
4. Keep the slot budget explicit to avoid prompt bloat.

### Done when

- working memory directly supports soul and response planning
- future perception inputs can land in memory slots cleanly
- prompt compilation reads bounded, semantic sections

## Phase 5: Signal-Based Growth Path

### Goal

Prepare the system for perception and richer expression without destabilizing the core.

### Rule

Every new context source must first become a `Signal`.

Examples:

- schedule drift becomes `ScheduleSignal`
- unusual silence or behavioral change becomes `BehavioralSignal`
- device or environment context becomes `EnvironmentalSignal`

### Files likely involved later

- new runtime signal modules in `packages/core`
- schedule adapters in `apps/server`
- future client signal sources in `apps/mobile`

### Done when

- new inputs attach through normalization rather than ad hoc conditions
- soul and memory modules consume structured signals, not raw source-specific data

## 6. First Implementation Batch

If we want the first concrete refactor batch, it should be this:

### Batch A

1. fix `provider-stream-outcome` test drift
2. keep `apps/server/src/runtime/create-chat-turn-stream.ts` as the single canonical runtime shell
3. add `ResponseSpec` contract
4. add `SignalSet` contract
5. keep prompt compilation and chat helpers under `packages/core/src/prompt/*`

### Batch B

1. create `run-turn-kernel()` in `packages/core`
2. move current soul response planning into `ResponseSpec`
3. move current route entry to a new server runtime entrypoint

### Batch C

1. redesign `WorkingMemory`
2. adapt retrieval and prompt compiler to the new memory shape
3. keep runtime spans intact while stage names evolve

## 7. Suggested PR Sequence

If we want minimal conflict and cleaner review flow:

### PR 1: Cleanup

- docs alignment
- deprecate old runtime path
- fix provider stream tests

### PR 2: Contracts

- add `signal.ts`
- add `response.ts`
- export from `packages/contracts`

### PR 3: Pure kernel skeleton

- add `run-turn-kernel()`
- extract `ResponseSpec`
- extract prompt compiler

### PR 4: Server shell split

- new runtime folder in `apps/server`
- route points to new entry
- old orchestration file shrinks or disappears

### PR 5: Working memory redesign

- contract update
- builder update
- prompt compiler update

## 8. Verification Checklist

For each phase, keep the same verification baseline:

1. `bun run typecheck`
2. targeted unit tests for changed pure modules
3. targeted runtime tests where the contract changed
4. manual smoke check for `/v1/chat/stream`

Recommended additions once kernel extraction starts:

- unit tests for `build-response-spec`
- unit tests for `run-turn-kernel`
- contract tests for prompt compilation

## 9. Risk Notes

### Risk 1

If we redesign `WorkingMemory` too early, prompt and runtime code will both thrash.

Mitigation:

- extract kernel first
- redesign working memory second

### Risk 2

If we keep both old and new runtime paths alive too long, the refactor will stall.

Mitigation:

- explicitly delete transitional paths once the new entrypoint is stable

### Risk 3

If prompt compilation stays inside orchestration, `ResponseSpec` will become decorative.

Mitigation:

- move prompt text generation behind a dedicated compiler boundary in Phase 2

## 10. Refactor Note

AGGRESSIVE REFACTOR:

If a transitional abstraction blocks the kernel split, prefer deletion over compatibility scaffolding. This project is still early, and architectural clarity is more valuable than preserving incidental structure.
