---
title: "Reflection Source: Codex Contracts And Normalization"
---

# Reflection Source: Codex Contracts And Normalization

> Status: Active design
> Date: 2026-05-23
> Companion docs:
>
> - [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> - [./reflection-pipeline-simplification.md](./reflection-pipeline-simplification.md)
> - [./reflection-source-codex-app-server.md](./reflection-source-codex-app-server.md)
> - [./reflection-source-codex-local-bridge-setup.md](./reflection-source-codex-local-bridge-setup.md)
> - [./reflection-observation-ingestion-pipeline.md](./reflection-observation-ingestion-pipeline.md)
> - [./reflection-report-pipeline.md](./reflection-report-pipeline.md)
> - [./reflection-daily-report-design.md](./reflection-daily-report-design.md)
> - [../workbench/features/reflection-codex-source.md](../workbench/features/reflection-codex-source.md)

## 1. Purpose

This document defines the target raw contract and normalize strategy for the Codex source after reflection pipeline simplification.

It answers three questions:

1. what raw payload should the Codex bridge push
2. what should Codex normalize produce
3. what transcript shape should survive into normalized observations for daily report generation

---

## 2. Core Decision

Codex should keep the current raw posture:

- full completed-turn transcript in raw storage
- one raw item per completed turn

But normalize should be simplified to:

```text
one raw Codex turn
  -> one codex_turn observation
```

This replaces the old split:

- `codex_turn`
- `codex_edit_batch`
- `codex_failure_event`

The edit and failure signal should remain, but as fields inside the same `codex_turn` observation.

For report generation, the important normalized artifact is a **purified report transcript**, not a replay of tool and command details.

---

## 3. Raw Payload Contract

The raw payload contract remains correct in principle:

- preserve full turn transcript projections
- preserve `rawTurn` as replay anchor
- preserve explicit identity and timing

The key fields remain:

- `sessionId`
- `threadId`
- `turnId`
- `turnStatus`
- `startedAt`
- `completedAt`
- `cwd`
- `modelProvider`
- `model`
- `threadTitle`
- `userMessages`
- `assistantMessages`
- `toolCalls`
- `commandExecutions`
- `fileChanges`
- `approvals`
- `rawTurn`

Raw still owns exact replay fidelity.

---

## 4. Import And Backfill

Codex should remain supported by the same import and backfill contracts used for recovery and bounded replay.

That remains true even under the simplified pipeline because:

- history seeding still matters
- local bridge downtime recovery still matters
- deterministic re-send of bounded windows still matters

No conceptual change is needed here.

---

## 5. Current Normalize Strategy

Today one raw Codex turn may produce:

- `codex_turn`
- optional `codex_edit_batch`
- optional `codex_failure_event`

This was acceptable when later pipeline stages wanted smaller specialized observations.

It is no longer the right shape for the simplified report-first model.

Reason:

- it fragments one turn across multiple normalized rows
- it makes report synthesis reassemble one conceptual unit from multiple artifacts
- it increases fanout without enough value

---

## 6. Target Normalize Strategy

Target rule:

- one raw completed turn transcript
- one `codex_turn` observation

That `codex_turn` should include:

- summary
- tags
- metrics
- purified report-facing transcript projection in `content`

## 6.1 Summary

The summary should still be compact and operator-readable.

Examples:

- `Codex turn: design the bridge docs, edited 3 files, ran 2 commands`
- `Codex turn: run the build, with failures`

## 6.2 Tags

Tags should stay lightweight and index-friendly.

Recommended tags:

- cwd basename
- tool kinds
- file extension hints
- turn status when not completed
- failure markers such as `tool_failed`, `command_failed`, `approval_denied`

## 6.3 Metrics

Metrics should surface counts, not narrative meaning.

Recommended metrics:

- `userMessageCount`
- `assistantMessageCount`
- `toolCallCount`
- `commandExecutionCount`
- `changedFileCount`
- `failedToolCallCount`
- `failedCommandCount`
- `deniedApprovalCount`

## 6.4 Content

`content` should preserve the report-facing transcript projection needed by daily reflection.

It should keep:

- ordered user messages
- substantial assistant responses
- turn-level metadata
- metrics and tags useful for grounding system friction

It should not duplicate:

- tool call detail
- command stdout and stderr
- reasoning traces
- the opaque raw `rawTurn` payload

Recommended content shape:

```ts
{
  sessionId: string;
  threadId: string;
  turnId: string;
  turnStatus: "completed" | "interrupted" | "failed";
  startedAt: string | null;
  completedAt: string | null;
  cwd: string | null;
  source: string | null;
  modelProvider: string | null;
  model: string | null;
  threadTitle: string | null;
  reportTranscript: Array<{
    role: "user" | "assistant";
    text: string;
  }>;
  fileChanges: Array<{
    path: string;
    changeKind: "create" | "update" | "delete" | null;
  }>;
  metrics: {
    changedFileCount: number;
    failedToolCallCount: number;
    failedCommandCount: number;
    deniedApprovalCount: number;
  };
  tags: string[];
}
```

This is intentionally rich where the report needs it, but operationally lighter than raw.

The simplified report pipeline depends on normalized observations containing enough conversation detail for synthesis.

## 6.5 Purification rule

The transcript projection should be deterministic and lightly purified.

Keep:

- user messages
- substantial assistant responses
- explanations, decisions, tradeoffs, and corrections

Drop:

- tool call payloads
- command outputs
- internal reasoning traces
- trivial operational chatter without semantic value

---

## 7. Raw Versus Normalized Boundary

The correct boundary is:

- `raw.payload.rawTurn` keeps the exact source-shaped replay blob
- `observation.content` keeps the purified **report-facing transcript projection**

We should **not** copy the raw opaque `rawTurn` blob straight into normalized `content`.

Reason:

- raw stays the replay anchor
- normalized stays schema-stable and source-aware
- report jobs can use normalized observations without learning App Server-specific raw formats

---

## 8. Git Versus Codex Normalize

For alignment:

- Git normalize remains one raw commit -> one `git_commit`
- Codex normalize becomes one raw turn -> one `codex_turn`

So the target observation layer stays simple:

- one raw source unit
- one normalized observation unit

for both current major work sources.

---

## 9. Report Implication

The entire reason to keep transcript detail in `codex_turn.content` is that later report generation will no longer depend on:

- state estimates
- episodes
- pattern hypotheses

Daily reports will read normalized observations directly and should be able to reconstruct the day's meaningful working conversation.

So Codex normalized observations must remain conversation-rich enough for report synthesis without dragging raw execution noise into the prompt.
