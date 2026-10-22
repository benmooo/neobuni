---
title: "Reflection Push Ingestion Substrate"
---

# Reflection Push Ingestion Substrate

> Status: Active design
> Date: 2026-05-23
> Companion docs:
>
> - [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> - [./reflection-pipeline-simplification.md](./reflection-pipeline-simplification.md)
> - [./reflection-contracts-and-storage.md](./reflection-contracts-and-storage.md)
> - [./reflection-observation-ingestion-pipeline.md](./reflection-observation-ingestion-pipeline.md)
> - [./reflection-report-pipeline.md](./reflection-report-pipeline.md)
> - [./reflection-source-git.md](./reflection-source-git.md)
> - [./reflection-source-git-local-bridge.md](./reflection-source-git-local-bridge.md)
> - [./reflection-source-codex-app-server.md](./reflection-source-codex-app-server.md)

## 1. Purpose

This document defines the shared push-first ingestion substrate for reflection sources.

It exists to answer one architectural question:

**how should first-party local sources deliver observations into Buni without making the server poll them?**

This document defines:

- the steady-state delivery model for local reflection sources
- the boundary between local source bridges and server ingestion
- authentication and delivery semantics for pushed batches
- how push integrates with `RawObservation`, normalized observations, and report dirtiness
- when `import` is still allowed

It does not define:

- source-specific payload semantics
- source-specific normalization logic
- report synthesis logic
- removed legacy middle-layer artifacts

---

## 2. Core Decision

The reflection system should be **push-first** for first-party local sources.

That means:

- Buni server does not regularly fetch browser history, git logs, or Codex session data
- local source bridges observe events where they originate
- local source bridges push batches into Buni
- server append and rebuild logic remains source-agnostic after the push boundary

`poll` remains a supported contract value because some future integrations may need it.

But for the initial high-value sources in this project:

- `browser`
- `git`
- `codex`

the steady-state delivery path should be `webhook`, not `poll`.

`import` remains valid only for:

- first-time backfill
- crash recovery
- manual re-send of missing history
- sources that cannot practically support live push

---

## 3. Why This Boundary Is Correct

This design preserves the right architectural split:

- source-specific IO and collection stay at the edge
- server-side reflection remains append-first and rebuildable
- push delivery only changes how raw data arrives, not the normalized-observation boundary

It also matches the nature of the target sources:

- browser focus events are born in the browser
- git commit events are born in local repos
- Codex thread and turn transcripts are available through the local Codex App Server

Making the server poll for them would add avoidable complexity:

- scheduling
- cursor drift
- local filesystem or browser API access from the server
- unnecessary latency
- worse privacy and trust boundaries

---

## 4. Design Rules

### 4.1 Push is the steady-state path

For first-party local sources, the normal path is:

```text
source event
  -> local bridge
  -> signed push batch
  -> raw append
  -> bounded observation rebuild
  -> report dirtiness mark
```

not:

```text
server scheduler
  -> poll source
  -> fetch provider page
  -> synthesize missing local state
```

### 4.2 Import is fallback, not the mainline

Manual import should remain available, but it should be framed as:

- backfill
- repair
- recovery

It should not be the primary delivery path for sources that can push.

### 4.3 Delivery is at-least-once, not exactly-once

The substrate should optimize for correctness and simplicity:

- local bridges may retry
- server may receive duplicates
- `dedupeKey` and bounded rebuilds provide correctness

Exactly-once transport semantics are unnecessary at this stage.

### 4.4 Edge code stays source-specific and thin

Local bridges may:

- authenticate
- observe local events
- enrich raw events with stable metadata
- batch and retry

Local bridges should not:

- infer latent state
- classify episodes
- generate psychological narratives
- decide runtime reflection meaning

### 4.5 Server remains append-first and rebuildable

Server ingestion should continue to be:

- append raw
- rebuild normalized observations by bounded window
- mark affected report periods dirty

Push does not change the downstream contract.

### 4.6 Privacy defaults belong at the edge

Local bridges should filter sensitive payloads before push.

The server should not depend on receiving raw private material and then trying to suppress it later.

Examples:

- browser bridge should block incognito and sensitive domains by default
- git bridge should not push patch contents
- Codex bridge may push full transcript items in V1, but it should still redact explicit secrets and avoid opaque binary payloads

---

## 5. High-Level Architecture

```text
Local Source
  -> Local Source Adapter
  -> Local Durable Outbox
  -> Signed Push Batch
  -> Reflection Push API
  -> RawObservation append
  -> Observation rebuild
  -> Report dirtiness registration
```

Expanded:

```text
Chrome extension / global git hook / Codex runtime
  -> source-specific collector
  -> normalized push envelope
  -> local outbox with retry
  -> POST /reflection/push
  -> authenticate source config
  -> append raw rows with dedupe
  -> derive target window
  -> rebuild observations in bounded window
  -> mark daily report windows dirty
```

---

## 6. Local Bridge Model

Each push-capable source should have a local bridge with four responsibilities.

### 6.1 Observe local events

Examples:

- browser tab focus slices ending
- global git `post-commit`
- Codex turn completion or periodic transcript sync through Codex App Server

### 6.2 Build push envelopes

The bridge converts local source events into source-agnostic push items:

- explicit `occurredAt`
- stable `dedupeKey`
- bounded `payload`
- source provenance metadata

### 6.3 Persist a durable outbox

The local bridge must not depend on the network being available at the moment the source event occurs.

So it should write push items to a local outbox first, then flush asynchronously.

This prevents:

- browser event loss during server downtime
- commit latency because the server is unavailable
- Codex session loss when the desktop app is offline

### 6.4 Retry until acknowledged

Retry policy should be simple:

- exponential backoff
- bounded batch size
- keep retrying until success or explicit discard

The local bridge owns this retry loop.

The server should not try to reconstruct missed local events by polling.

---

## 7. Shared Push Contract

The push substrate should introduce a server endpoint parallel to `/reflection/import`.

Suggested route:

```text
POST /reflection/push
```

Suggested request shape:

```ts
type ReflectionPushBatchRequest = {
  sourceConfigId: string;
  sourceKind: ObservationSourceKind;
  pushedAt: string;
  batchId: string;
  items: Array<{
    externalId?: string | null;
    dedupeKey: string;
    capturedAt?: string | null;
    occurredAt: {
      startedAt: string;
      endedAt: string | null;
    };
    payload: Record<string, unknown>;
    provenance?: Record<string, unknown>;
  }>;
};
```

Suggested response shape:

```ts
type ReflectionPushBatchResponse = {
  sourceConfigId: string;
  sourceKind: ObservationSourceKind;
  batchId: string;
  acceptedAt: string;
  targetWindow: {
    startedAt: string;
    endedAt: string | null;
  };
  rawInsertedCount: number;
  rawDuplicateCount: number;
  normalizedObservationCount: number;
  dirtyDailyReportCount: number;
};
```

Notes:

- `batchId` is transport-level tracing, not deduplication truth
- `dedupeKey` remains the primary idempotency key per raw item
- the response should only acknowledge the ingest boundary, not downstream report synthesis

---

## 8. Authentication and Trust Boundary

Push requests should be authenticated per source config.

The server should mint one secret per source config and store only a reference in durable config state.

Recommended V1 request headers:

```text
X-Buni-Source-Id: <sourceConfigId>
X-Buni-Timestamp: <iso timestamp>
X-Buni-Signature: <hmac sha256 over timestamp + body hash>
```

Validation rules:

- source config must exist and belong to the active profile
- source config status must be `active`
- timestamp skew must be bounded
- signature must match current secret

This keeps authentication scoped and revocable:

- revoke one compromised bridge without affecting other sources
- rotate one source secret independently

---

## 9. Delivery and Correctness Semantics

### 9.1 Correctness model

The end-to-end correctness model is:

- at-least-once source delivery
- idempotent raw append by `dedupeKey`
- bounded observation rebuild by target window

This is the right tradeoff for an early-stage reflection system because:

- raw append stays simple
- downstream heuristics remain rebuildable
- bridges can stay robust without transport complexity

### 9.2 Ack boundary

The server should acknowledge a push batch only after:

1. authentication succeeds
2. raw rows are appended or deduped
3. the target normalize window is known
4. normalized observations for that window have been rebuilt
5. affected daily report windows have been marked dirty or durably scheduled for dirty marking

V1 may run normalize inline for simplicity.

Later versions can enqueue normalize while preserving the same push contract.

### 9.3 Failure behavior

Failures split into two classes:

1. hard ingest failure
   - auth failure
   - malformed payload
   - raw append failure
   - normalize failure
   - report-dirty registration failure

There is no report-build dependency in the push ack path anymore.

Actual daily, weekly, and monthly report generation happens later in scheduled jobs.

---

## 10. Relationship To Existing `syncMode`

The existing source contract already allows:

- `poll`
- `webhook`
- `import`

This substrate does not remove `poll`.

It only clarifies policy:

- first-party local sources should prefer `webhook`
- `import` remains a repair and backfill path
- `poll` is for integrations where push is impossible or clearly worse

So the change is mainly architectural intent and shared execution shape, not a fundamental contract rewrite.

---

## 11. Dirty Window Handling

Push batches should still flow through the same window derivation rules already used by import.

The server should:

- derive the bounded target window from accepted items
- normalize within that window
- mark affected daily report windows dirty

This keeps push and import unified after the append boundary.

The main difference is only how data arrives.

---

## 12. Import Fallback

`/reflection/import` should remain in the system.

Its role is now explicit:

- historical backfill
- replay from exported data
- one-off repair when a local bridge was not installed
- emergency manual recovery

The import path should reuse the same append and rebuild logic as push wherever possible.

In practice that means:

- shared raw append
- shared bounded normalize
- shared report-dirty marking

That keeps the system from splitting into two ingestion stacks.

---

## 13. Initial Source Mapping

The first three push-first sources should map like this:

| Source            | `sourceKind` | `connectorKind`          | `syncMode` | Steady-state granularity |
| ----------------- | ------------ | ------------------------ | ---------- | ------------------------ |
| Chrome tab focus  | `browser`    | `chrome_extension`       | `webhook`  | `event`                  |
| Local git commits | `git`        | `local_git`              | `webhook`  | `event`                  |
| Codex turns       | `codex`      | `local_codex_app_server` | `webhook`  | `turn`                   |

`import` remains available for all three as a secondary path.

---

## 14. File-Level Implementation Direction

### 14.1 `packages/contracts`

- add `ReflectionPushBatchRequest`
- add `ReflectionPushBatchResponse`
- add `codex` to `ObservationSourceKind`
- keep source and ingestion contracts explicit and versionable

### 14.2 `apps/server`

- add a push route beside `/reflection/import`
- add request authentication for source-config-scoped secrets
- add `runReflectionPushSource` orchestration that shares append and rebuild logic with import

### 14.3 `packages/db`

- extend source-config lifecycle to support push secret issuance and rotation
- persist any source-scoped push metadata needed for audit and sync health

### 14.4 Local bridge packages or scripts

- implement a small reusable outbox sender
- let each source adapter focus on event collection and payload shaping
- Codex should use Codex App Server as its canonical read surface rather than parsing hook transcript files directly

---

## 15. Acceptance Criteria

This substrate is ready when:

1. the server exposes one authenticated push endpoint for reflection batches
2. pushed batches append raw rows idempotently and trigger the same bounded normalize pipeline as import
3. local bridges can retry safely without duplicate downstream corruption
4. `import` remains usable as backfill and recovery instead of being removed
5. source-specific code remains at the edge and reflection interpretation remains server-side
