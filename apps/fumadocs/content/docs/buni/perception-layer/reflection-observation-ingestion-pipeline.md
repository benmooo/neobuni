---
title: "Reflection Observation Ingestion Pipeline"
---

# Reflection Observation Ingestion Pipeline

> Status: Active design
> Date: 2026-05-23
> Companion docs:
> - [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> - [./reflection-pipeline-simplification.md](./reflection-pipeline-simplification.md)
> - [./reflection-contracts-and-storage.md](./reflection-contracts-and-storage.md)
> - [./reflection-push-ingestion-substrate.md](./reflection-push-ingestion-substrate.md)
> - [./reflection-report-pipeline.md](./reflection-report-pipeline.md)
> - [./reflection-source-codex-contracts-and-normalization.md](./reflection-source-codex-contracts-and-normalization.md)

## 1. Purpose

This document defines the execution-level design of the simplified reflection ingestion pipeline.

It answers one execution question:

**after a source pushes or imports raw data, what should the ingestion boundary do before report generation begins?**

This document covers:

- raw append
- deterministic normalize
- source dedupe
- bounded observation rebuild
- report-dirty handoff

It does not cover:

- state estimation
- episode building
- pattern inference
- context snapshot generation

Those layers are no longer part of the target pipeline.

---

## 2. Core Decision

The ingestion pipeline now ends at **normalized observations**.

The target shape is:

```text
source push / poll / import
  -> append RawObservation
  -> rebuild Observation in bounded window
  -> mark report periods dirty
```

not:

```text
source ingest
  -> state estimation
  -> episode build
  -> pattern inference
  -> report build
  -> context build
```

This is the right simplification because:

- raw data still remains replayable
- normalized observations remain deterministic
- report synthesis can evolve independently
- source-specific complexity stays near normalize rather than leaking into many downstream layers

---

## 3. Scope Boundary

The ingestion pipeline is complete when:

- raw rows are durably appended
- canonical normalized observations exist for the affected window
- downstream report periods are known to be stale or ready for rebuild

Ingestion does not synchronously generate daily, weekly, or monthly reports.

---

## 4. Design Rules

### 4.1 Raw first

Every source should append raw payloads before any interpretation happens.

### 4.2 Normalize deterministically

Normalize should remain deterministic and schema-first.

It may project and compress source data, but it should not call LLMs.

### 4.3 Normalize rich enough for reporting

Normalized observations should contain enough structured content that report jobs do not need to reopen raw payloads for ordinary synthesis.

This is especially important for Codex.

### 4.4 Rebuild by bounded window

Normalization should replace observations in a bounded window rather than trying to maintain row-level downstream state.

### 4.5 Reports are downstream jobs

Ingestion should only hand off dirty report periods.

Report generation belongs to scheduled or manual report jobs.

---

## 5. High-Level Pipeline

```text
Source Trigger
  -> Connector Sync
  -> RawObservation append
  -> NormalizeWindow
  -> Observation replace
  -> ReportWindow dirty mark
```

Recommended execution shape:

```text
poll / webhook / import
  -> run-ingest-source
  -> append-raw-batch
  -> run-normalize-window
  -> mark daily report windows dirty
```

Weekly and monthly dirtiness should be derived from daily windows, not rebuilt directly in the ingest request path.

---

## 6. Normalize Responsibilities

Normalize owns:

- source-specific payload parsing
- stable `kind`
- tags
- metrics
- structured `content`
- canonical hash generation

Normalize does not own:

- latent state inference
- narrative segmentation
- recurring pattern inference
- free-form synthesis

---

## 7. Source-Specific Normalize

## 7.1 Git

Git normalize remains simple:

- one raw commit
- one `git_commit` observation

## 7.2 Codex

Codex normalize should be simplified to:

- one raw completed turn transcript
- one `codex_turn` observation

That `codex_turn` should contain the full structured transcript projection inside `content`.

Separate normalized sub-artifacts such as `codex_edit_batch` and `codex_failure_event` are no longer part of the target design.

---

## 8. Dirty Window Handoff

After observations are rebuilt, the system should derive affected report periods.

Minimum handoff:

- local-calendar `daily` windows touched by the rebuilt observations

From there:

- changed daily windows can mark containing weekly windows dirty
- changed daily windows can mark containing monthly windows dirty
- those rollup marks are deferred work, not immediate builds
- weekly/monthly should only be consumed after the target period window is closed

This keeps the ingest path small and explicit.

---

## 9. Operational Model

Ingest success should mean:

- raw append succeeded
- normalize succeeded

It should not be blocked by:

- daily report generation
- weekly report generation
- monthly report generation

Those are downstream scheduled tasks.

---

## 10. Current Migration Direction

The old middle layers are being removed:

- `StateEstimate`
- `Episode`
- `PatternHypothesis`
- `ContextSnapshot`

The stable substrate after this simplification is:

- `RawObservation`
- `Observation`
- `ReflectionReport`
