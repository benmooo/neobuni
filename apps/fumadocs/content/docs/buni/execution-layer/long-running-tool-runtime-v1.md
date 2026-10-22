---
title: "Buni Long-Running Tool Runtime V1"
---

# Buni Long-Running Tool Runtime V1

> Version: 1.0
> Date: 2026-05-27
> Status: Parked draft, not in active use

> Note:
> This design was explored and partially prototyped, then rolled back.
> Keep this document as reference only.
> The current runtime does not adopt this async tool model.

## 0. Purpose

This document defines the first durable runtime design for long-running tools in Buni.

The immediate trigger is a concrete failure mode in the current chat runtime:

- the model can call a tool such as `create_reflection_report` or `update_reflection_report`
- that tool may synchronously wait on another provider call
- the enclosing chat SSE request can disconnect or be aborted before the tool finishes
- the user sees a stalled or aborted turn even if the backend work eventually completes

The V1 goal is not to invent a full workflow engine.

The V1 goal is to stop binding multi-second or multi-minute work to the lifecycle of a single chat stream.

## 1. Problem Statement

### 1.1 Current shape

Today Buni uses a synchronous tool execution model:

```text
chat request
  -> provider decides to call tool
  -> server executes tool inline
  -> tool may call providers / DB / integrations
  -> tool result returns into the same provider turn
  -> assistant continues the same response
```

This is fine for:

- memory lookup
- deterministic transforms
- quick database queries
- short integration requests

This is not robust for:

- reflection report builds that call a reasoning model
- cross-system delivery chains
- imports or backfills
- any tool with variable latency or partial retry behavior

### 1.2 Why the current runtime breaks

The chat runtime is currently anchored to the incoming request signal:

- `apps/server/src/routes/chat.ts` creates an `AbortController`
- client disconnect maps to request abort
- provider stream lifecycle ends with the turn
- tool execution is still embedded in that same turn

That means the outer request is the real execution container.

If a tool runs long enough, the request can end because of:

- client navigation or refresh
- user stop action
- network interruption
- proxy or platform timeout
- runtime-level abort propagation

Once that happens, the turn is over, regardless of whether the tool's internal work was still meaningful.

### 1.3 Why timeout-only fixes are insufficient

The recent timeout fix removed one concrete failure mode:

- inner report-provider calls no longer wait forever
- stale `report_build` jobs no longer remain `running` forever

That fix is necessary, but not sufficient.

It still assumes:

- the user stays attached to the same stream
- the tool should finish before the current turn ends
- the model should keep waiting inside the same orchestration round

That assumption is wrong for any tool that can reasonably exceed normal interactive latency.

## 2. Design Principles

### 2.1 Treat long-running work as jobs

If a tool can take longer than normal chat latency, it must stop being an inline effect.

It must become:

```text
tool call
  -> enqueue durable job
  -> return job handle immediately
  -> background worker executes job
  -> later poll / inspect / resume
```

### 2.2 Keep the chat runtime conversational

The chat runtime should remain good at:

- deciding what to do next
- launching work
- checking progress
- summarizing completed results

It should stop pretending to be the execution container for long work.

### 2.3 Reuse existing reflection job state

Buni already has:

- `reflection_job_runs`
- `report_build` status tracking
- report window semantics

V1 should extend this substrate instead of creating a parallel async system.

### 2.4 Preserve functional core, imperative shell

The runtime split should be:

- pure window resolution and report selection logic stay pure
- queueing, claiming, execution, retries, and persistence stay in the shell

## 3. V1 Scope

V1 covers one concrete path:

- asynchronous canonical reflection report build

That means:

- canonical `day / week / month` builds
- persisted report output
- background execution detached from the current chat stream
- explicit job inspection

V1 does **not** yet cover:

- ad-hoc report generation with custom dimensions or instructions
- generic async wrapping for every tool
- cross-process distributed workers
- automatic conversation resumption after a completed job
- pushing completed tool results back into a dead turn

## 4. Target User-Level Flow

### 4.1 New long-running report flow

```text
user asks for a report action
  -> model decides this should be backgrounded
  -> queue_reflection_report_build(...)
  -> tool returns { jobId, status: "queued" | "running" }
  -> assistant tells the user the build has started
  -> model or user later calls get_reflection_report_build_status(jobId)
  -> if succeeded, assistant uses the resulting report
```

### 4.2 Explicit conversational semantics

The assistant must describe these states truthfully:

- `queued`: work has been accepted, not completed
- `running`: work is in progress, no final report yet
- `succeeded`: report is available
- `failed`: work ended with an error

The assistant must not say:

- "done" when only queued
- "rebuilt" when only accepted
- "sent" when only rendered

## 5. Architecture

## 5.1 Current synchronous path

```text
Chat SSE Request
  -> createChatTurnStream
  -> provider tool call
  -> create_reflection_report / update_reflection_report
  -> runReflectionReportPeriod
  -> provider call inside tool
  -> same turn waits for result
```

## 5.2 V1 asynchronous path

```text
Chat SSE Request
  -> createChatTurnStream
  -> provider tool call
  -> queue_reflection_report_build
  -> persist queued job
  -> schedule detached worker task
  -> return job handle immediately

Detached Worker
  -> claim queued report job
  -> run canonical report build
  -> persist success/failure

Later Chat Turn or Poll
  -> get_reflection_report_build_status(jobId)
  -> load job + report
  -> assistant summarizes current state
```

## 5.3 Key boundary change

The job is the durable execution boundary.

The chat turn is no longer the durable execution boundary.

That is the whole point of this refactor.

## 6. Data Model

## 6.1 Reuse `reflection_job_runs`

V1 extends `reflection_job_runs` with explicit queued-job behavior.

We will use existing fields:

- `jobKind`
- `status`
- `targetWindow`
- `input`
- `output`
- `error`

### V1 status usage

- `queued`: accepted but not yet claimed
- `running`: claimed and executing
- `succeeded`: finished successfully
- `failed`: finished with error

### V1 output payload for canonical report build

Recommended output shape:

```ts
{
  period: "daily" | "weekly" | "monthly";
  reportId: string | null;
  sourceObservationCount?: number;
  sourceDailyReportCount?: number;
}
```

This keeps the job row compact and lets later inspection load the persisted report by id.

## 6.2 New tool-level contracts

V1 introduces two explicit tools:

### `queue_reflection_report_build`

Purpose:

- queue one canonical report build without waiting for completion

Input:

```ts
{
  mode: "day" | "week" | "month";
  localDate?: string;
  anchorIso?: string;
  timezone?: string;
  language?: string;
}
```

Output:

```ts
{
  jobId: string;
  status: "queued" | "running";
  reportKind: "daily" | "weekly" | "monthly";
  title: string;
  timezone: string;
  window: {
    startedAt: string;
    endedAt: string;
  };
  notes: string[];
}
```

### `get_reflection_report_build_status`

Purpose:

- inspect a queued/running/completed report-build job

Input:

```ts
{
  jobId: string;
}
```

Output:

```ts
{
  jobId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  reportKind: "daily" | "weekly" | "monthly";
  timezone: string;
  window: {
    startedAt: string;
    endedAt: string;
  };
  report: ResolveReflectionReportOutput | null;
  errorMessage: string | null;
  notes: string[];
}
```

## 7. Execution Model

## 7.1 Queue step

`queue_reflection_report_build` must:

1. resolve the canonical report window
2. create a queued job row
3. trigger detached execution
4. return immediately

This tool must not wait for the report to finish.

## 7.2 Claim step

Detached execution must first claim the queued job.

Claim means:

- only a queued job may transition to running
- claiming must be conditional on current status
- if another worker already claimed it, the current attempt exits cleanly

V1 may assume a single-process local worker model, but claim semantics should still be explicit.

## 7.3 Build step

The detached worker must run the same canonical report build logic as the synchronous path.

That means V1 should extract the core report-build logic so it can run in two wrappers:

- synchronous wrapper that creates an immediate running job
- asynchronous wrapper that consumes an already queued job

## 7.4 Inspection step

Status inspection must:

1. load the job row
2. decode the request payload
3. if succeeded and `reportId` exists, load the report
4. render a typed status response

## 8. Failure Model

### 8.1 Queue accepted, worker never starts

If the process dies before the detached worker claims the job, the row remains `queued`.

That is acceptable in V1.

It is strictly better than losing the work inside a dead chat turn.

### 8.2 Worker starts, then stalls

Existing stale-job cleanup remains necessary.

For V1:

- stale `running` report jobs can still be failed by timeout policy
- later queue or scheduler paths can recover or retry

### 8.3 Client disconnect

Client disconnect must no longer destroy the background build itself.

It only destroys the current conversation stream.

That is the behavioral change we want.

## 9. Prompt and Tooling Semantics

The model should continue using synchronous tools for short operations.

The model should prefer the async report-build tool when:

- the user explicitly wants work to continue in the background
- the report action is a canonical build/rebuild that can be checked later
- preserving execution across stream aborts matters more than same-turn completion

The model should prefer synchronous reflection report CRUD tools when:

- it only needs a persisted report artifact for an exact target
- immediate same-turn content is required and latency is acceptable
- the result should stay aligned with the persisted CRUD surface instead of a background job handle

## 10. Implementation Plan

## Phase 1

Build the minimum useful path:

1. add the detailed design doc
2. add queued job repo primitives
3. extract report-build core logic from the synchronous wrapper
4. add `queue_reflection_report_build`
5. add `get_reflection_report_build_status`
6. wire detached execution
7. add focused tests

## Phase 2

Improve recovery and visibility:

1. expose job status in reflection ops UI
2. allow scheduler sweep to recover orphaned queued jobs
3. update prompt/tool semantics to bias toward async path when appropriate

## Phase 3

Generalize the substrate:

1. move from report-specific async to generic long-running tool jobs
2. add resumable conversation follow-up patterns
3. support more durable worker execution beyond in-process detachment

## 11. Non-Goals for V1 Implementation

V1 should not:

- block this change on a distributed queue
- redesign the entire tool protocol surface
- solve every long-running tool at once
- rebuild the chat UI around resumable execution before the server substrate exists

## 12. Definition of Done for V1

V1 is done when all of the following are true:

1. a canonical report build can be queued and return immediately
2. queued work can finish after the original chat turn ends
3. the resulting job can be inspected later
4. successful completion yields a persisted canonical report
5. failed completion yields a typed failed job state
6. the synchronous path still works for existing callers
