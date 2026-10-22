---
title: "Reflection Source: Codex App Server"
---

# Reflection Source: Codex App Server

> Status: Active design
> Date: 2026-05-23
> Companion docs:
> - [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> - [./reflection-pipeline-simplification.md](./reflection-pipeline-simplification.md)
> - [./reflection-push-ingestion-substrate.md](./reflection-push-ingestion-substrate.md)
> - [./reflection-observation-ingestion-pipeline.md](./reflection-observation-ingestion-pipeline.md)
> - [./reflection-contracts-and-storage.md](./reflection-contracts-and-storage.md)
> - [./reflection-source-codex-contracts-and-normalization.md](./reflection-source-codex-contracts-and-normalization.md)
> - [./reflection-source-codex-local-bridge-setup.md](./reflection-source-codex-local-bridge-setup.md)
> - [../workbench/features/reflection-codex-source.md](../workbench/features/reflection-codex-source.md)

## 1. Purpose

This document defines the Codex source design when Buni uses Codex App Server as the ingestion boundary.

It answers one practical question:

**how should Codex session data enter reflection without relying on unstable local transcript files or lossy local summarization?**

This document defines:

- the canonical read boundary for Codex data
- the local bridge runtime shape
- the transcript capture unit
- cursor and backfill behavior
- the raw payload shape for V1
- the privacy and redaction posture

Detailed contract and normalize rules live in
[`reflection-source-codex-contracts-and-normalization.md`](./reflection-source-codex-contracts-and-normalization.md).

The active simplified reflection direction lives in
[`reflection-pipeline-simplification.md`](./reflection-pipeline-simplification.md).

It does not define:

- detailed observation normalization rules
- report scheduling logic
- the Chrome or Git source implementations

---

## 2. Core Decision

The Codex source should use **Codex App Server as the canonical data source**.

The steady-state path is:

```text
Codex App Server
  -> local Codex bridge
  -> durable outbox
  -> POST /reflection/push
  -> raw append
  -> bounded observation rebuild
  -> report dirtiness mark
```

not:

```text
Codex hooks
  -> transcript file path
  -> parse local rollout files directly
  -> guess message boundaries
```

This is the right choice because:

- App Server exposes stable thread, turn, and item boundaries
- session identity is explicit
- completed turns are explicit
- stored history is queryable without reverse-engineering rollout files
- the bridge can push full transcript data without a local lossy digest step

---

## 3. Scope Boundary

## 3.1 What V1 captures

V1 should push **full completed turn transcripts** into reflection raw storage.

That means:

- one raw item per completed Codex turn
- full turn items included in payload
- no local LLM digest required before push

This preserves the full transcript while keeping the append unit bounded.

The full session transcript remains reconstructable by concatenating stored turn payloads in order.

## 3.2 What V1 does not capture

V1 should not:

- push rollout file paths as source-of-truth payload
- depend on hook-only transcript parsing
- push partial streaming deltas as durable truth
- wait for session end before sending anything

The durable unit is the **completed turn**, not the whole session blob.

---

## 4. Design Rules

### 4.1 App Server is canonical

The bridge should read Codex data from App Server methods and notifications.

Hooks may still exist, but only as optional triggers or operator conveniences.

### 4.2 Full transcript beats local digest

The bridge should not compress a turn into a local summary before push in V1.

We want raw reflection storage to preserve:

- user text
- assistant message text
- tool invocation records
- command execution records
- file change records
- approval outcomes

Any later summarization belongs on the server side.

### 4.3 Completed turn is the append unit

The bridge should only push a turn after it has a terminal status.

Good terminal states:

- `completed`
- `interrupted`
- `failed`

Streaming deltas are UI updates, not durable raw truth.

### 4.4 Session identity must be explicit

The bridge should read `sessionId` directly from App Server thread metadata.

It must not derive session identity from filenames or local path structure.

### 4.5 Transcript payloads still need redaction

Full transcript push does not mean zero filtering.

The bridge should still:

- redact explicit secrets when deterministically detectable
- drop obviously binary content
- avoid embedding large file blobs when a structured file-change item already exists

### 4.6 Backfill and live sync should share one shape

Whether a turn is discovered from:

- a live subscribed thread
- a periodic stored-thread sync
- a backfill scan

the bridge should emit the same raw payload contract.

---

## 5. Source Identity

The Codex source should use:

- `sourceKind: "codex"`
- `connectorKind: "local_codex_app_server"`
- `syncMode: "webhook"`
- `granularity: "turn"`

This keeps the server contract aligned with other push-first local sources:

- the bridge is local
- the bridge owns retries
- the server does not poll Codex directly

---

## 6. High-Level Architecture

```text
Codex App Server
  -> thread discovery / turn discovery
  -> local bridge assembler
  -> local outbox
  -> POST /reflection/push
  -> reflection raw observations
```

Expanded:

```text
codex app-server
  -> thread/list and thread/turns/list for stored history
  -> optional live notifications for threads owned by the bridge
  -> assemble one completed-turn transcript payload
  -> write one outbox record
  -> batch and sign push request
  -> server appends one raw item per turn
```

---

## 7. Bridge Runtime Shape

The Codex bridge should follow the same local-bridge philosophy as Git:

- thin imperative edge
- explicit local config
- durable local outbox
- retry outside the critical path

Suggested V1 CLI:

- `bootstrap-local`
- `sync`
- `flush`
- `repair`
- `backfill`
- `doctor`

### 7.1 `bootstrap-local`

Responsibilities:

- write local bridge config
- persist server base URL and source secret
- validate `codex` binary reachability
- validate that `codex app-server` can start

### 7.2 `sync`

Responsibilities:

- start or connect to Codex App Server
- list stored threads updated since the last watermark
- fetch turns for changed threads
- enqueue newly completed turns

This is the main steady-state bridge command.

### 7.3 `flush`

Responsibilities:

- reclaim stale `processing/` outbox records before claiming new work
- read pending outbox records
- batch them
- sign the push request
- call `/reflection/push`
- delete or archive successful records

### 7.4 `repair`

Responsibilities:

- scan `outbox/processing`
- detect stale processing leases after interrupted flushes
- move reclaimable records back to `outbox/pending`
- give operators an explicit recovery command in addition to auto-reclaim during `flush`

### 7.5 `backfill`

Responsibilities:

- rescan stored Codex threads within a bounded window
- re-enqueue turns not yet pushed
- support one-off repair after bridge downtime

### 7.6 `doctor`

Responsibilities:

- validate local config
- validate Codex App Server startup
- summarize outbox depth
- summarize stale processing records
- summarize latest synced thread and turn watermark
- surface server reachability

---

## 8. Canonical Read Surface

The bridge should prefer these App Server surfaces:

- `thread/list`
- `thread/read`
- `thread/turns/list`

If the bridge itself starts or resumes threads through App Server, it may also consume:

- `turn/started`
- `item/started`
- `item/completed`
- `turn/completed`

The bridge should treat read methods as the canonical recovery and backfill path.

Live notifications are an optimization, not the only correctness path.

---

## 9. Identity Model

The bridge should keep these identifiers distinct:

```ts
type CodexTurnIdentity = {
  sessionId: string;
  threadId: string;
  turnId: string;
};
```

Rules:

- `sessionId` groups a session tree
- `threadId` identifies one concrete thread
- `turnId` identifies one concrete turn within a thread

Recommended raw record identity:

- `externalId = turnId`
- `dedupeKey = codex:${threadId}:${turnId}`

This is safer than session-only dedupe because one session may contain multiple threads after forks.

---

## 10. Raw Payload Shape

The V1 raw payload should preserve the completed turn transcript with minimal interpretation.

Suggested contract:

```ts
type CodexRawTurnTranscriptPayload = {
  payloadVersion: "codex_app_server_turn_v1";
  sessionId: string;
  threadId: string;
  turnId: string;
  cwd: string | null;
  source: string | null;
  modelProvider: string | null;
  threadName: string | null;
  threadPreview: string | null;
  turnStatus: "completed" | "interrupted" | "failed";
  startedAt: string | null;
  completedAt: string | null;
  inputItems: Array<Record<string, unknown>>;
  outputItems: Array<Record<string, unknown>>;
  approvalRequests: Array<Record<string, unknown>>;
  toolCalls: Array<Record<string, unknown>>;
  commandExecutions: Array<Record<string, unknown>>;
  fileChanges: Array<Record<string, unknown>>;
  rawTurn: Record<string, unknown>;
};
```

Design notes:

- `rawTurn` preserves the closest source record
- the typed helper arrays make normalization easier later
- helper arrays are projections, not replacements for `rawTurn`

This keeps ingestion flexible:

- normalization can work from helper arrays
- re-normalization can still fall back to `rawTurn`

---

## 11. When To Push

The bridge should push after `turn/completed`.

In stored-history sync mode, the equivalent rule is:

- fetch turns
- select only turns with terminal status
- skip anything still in progress

This avoids storing partial assistant output or incomplete tool execution state as final raw truth.

---

## 12. Sync Strategy

The bridge should support two modes.

### 12.1 Stored-thread sync

This is the required correctness path.

Flow:

```text
thread/list sorted by updatedAt
  -> identify changed threads
  -> thread/turns/list(itemsView="full")
  -> select unseen completed turns
  -> enqueue one raw payload per turn
```

This mode works even when Buni did not create the Codex session.

### 12.2 Live-attached sync

This is an optimization path.

If the bridge starts or resumes threads itself, it can subscribe to live notifications and enqueue completed turns immediately.

This improves latency, but correctness must still be recoverable through stored-thread sync.

---

## 13. Cursor Model

The bridge should persist both global and per-thread watermarks.

Suggested local cursor state:

```ts
type CodexBridgeCursor = {
  lastThreadUpdatedAt: string | null;
  threadIdsAtLastThreadUpdatedAt: string[];
  threads: Record<string, {
    sessionId: string;
    lastCompletedTurnId: string | null;
    lastThreadUpdatedAt: string | null;
  }>;
};
```

Rules:

- global watermark narrows thread discovery
- per-thread watermark narrows turn replay
- dedupe still protects correctness if the cursor replays a turn

The bridge should optimize for clarity over clever cursor math.

---

## 14. Local Filesystem Layout

Recommended layout:

```text
~/.buni/
  reflection/
    codex/
      config.json
      state.json
      logs/
      outbox/
        pending/
        processing/
        failed/
```

Where:

- `config.json` is control-plane state
- `state.json` stores watermarks
- `logs/` stores local bridge command logs as append-only NDJSON
- `outbox/` stores durable delivery state

This matches the Git bridge shape closely enough that shared transport code can be reused.

Operational note:

- `processing/` is lease-based, not terminal state
- `flush` should reclaim stale processing records before sending the next batch
- `repair` should exist for explicit operator recovery when a local flush is interrupted

---

## 15. Privacy and Redaction

Because V1 pushes full transcript content, the Codex bridge must enforce a stricter edge privacy policy than Git.

The bridge should:

- redact obvious token patterns
- redact configured allowlisted secret names when they appear in plain text
- avoid binary blobs
- avoid local absolute file contents unless they already appear as explicit text output

The bridge should not:

- silently summarize sensitive turns instead of preserving them
- upload arbitrary rollout files wholesale
- depend on the server to discover and remove obvious secrets later

If a turn cannot be safely redacted deterministically, the bridge may mark the outbox record as blocked and require explicit operator override.

---

## 16. Relationship To Hooks

Hooks are optional in this design.

Valid uses:

- kick `sync` after `Stop`
- kick `sync` after `UserPromptSubmit`
- attach extra local metadata

Invalid uses:

- treating hook transcript files as the canonical source of truth
- parsing hook `transcript_path` as a stable interface
- pushing hook deltas as final durable turn content

This keeps the bridge anchored on the App Server contract rather than the local file implementation.

---

## 17. Server-Side Expectations

The existing reflection push API is still the right server boundary.

The Codex bridge should push ordinary `ReflectionPushItem` records whose payloads carry the Codex transcript shape.

Server-side work needed:

- allow Codex import/backfill contracts
- add Codex normalization later
- keep raw append idempotent by `dedupeKey`

The server should not need Codex-specific transport logic once the raw item arrives.

---

## 18. Acceptance Criteria

This plan is ready to implement when:

1. one local Codex bridge can start `codex app-server` and read stored threads
2. the bridge can discover updated threads and fetch full completed turns
3. the bridge writes one outbox record per completed turn
4. the bridge pushes those records through `/reflection/push` with stable dedupe keys
5. the resulting raw payload preserves full turn transcript structure without a local digest step
