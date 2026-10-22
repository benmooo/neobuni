---
title: "Reflection Pipeline Simplification"
---

# Reflection Pipeline Simplification

> Status: Active implementation
> Date: 2026-05-23
> Companion docs:
> - [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> - [./reflection-observation-ingestion-pipeline.md](./reflection-observation-ingestion-pipeline.md)
> - [./reflection-report-pipeline.md](./reflection-report-pipeline.md)
> - [./reflection-daily-report-design.md](./reflection-daily-report-design.md)
> - [./reflection-source-codex-contracts-and-normalization.md](./reflection-source-codex-contracts-and-normalization.md)
> - [./reflection-contracts-and-storage.md](./reflection-contracts-and-storage.md)
> - [../workbench/features/reflection-codex-source.md](../workbench/features/reflection-codex-source.md)

## 1. Purpose

This document defines the simplified target architecture for the reflection subsystem.

The active runtime path is now aligned with this document:

- ingest stops at `raw_observation -> observation`
- dirty daily report windows are marked during ingest
- daily reports build from normalized observations
- weekly and monthly reports build from daily reports
- the report path no longer depends on `reflection_links`
- legacy server/db code for state, episode, pattern, and context stages has been removed from the active system

It answers one practical question:

**what should remain in reflection after we remove the overly complex middle pipeline layers?**

This document defines:

- the retained layers
- the deleted layers
- the new normalize posture for Git and Codex
- the new report generation model
- the storage and lineage impact

---

## 2. Core Decision

Reflection should be simplified from:

```text
RawObservation
  -> Observation
  -> StateEstimate
  -> Episode
  -> PatternHypothesis
  -> ReflectionReport
  -> ContextSnapshot
```

to:

```text
RawObservation
  -> Observation
  -> Daily Report
  -> Weekly / Monthly Report
```

This means:

- raw append remains
- deterministic normalize remains
- report generation remains
- state estimation is removed
- episode construction is removed
- pattern hypothesis construction is removed
- context snapshot generation is removed

The system becomes:

- simpler to reason about
- cheaper to operate
- easier to debug
- easier to evolve source contracts for

---

## 3. Kept Layers

## 3.1 Raw observations

`RawObservation` remains the source-of-truth append layer.

It should preserve:

- replayability
- source-specific fidelity
- stable dedupe
- backfill and repair safety

## 3.2 Normalized observations

`Observation` becomes the main durable reasoning substrate.

It should be:

- deterministic
- source-aware
- schema-stable
- rich enough for report generation without reopening raw payloads in normal report builds

## 3.3 Reflection reports

`ReflectionReport` remains, but its dependency model changes:

- `daily` reports are generated from normalized observations plus LLM synthesis
- `weekly` reports are generated from daily reports
- `monthly` reports are generated from daily reports

---

## 4. Removed Layers

The following layers are removed from the target design:

- `StateEstimate`
- `Episode`
- `PatternHypothesis`
- `ContextSnapshot`

Reason:

- they introduced too much pipeline depth for the current product stage
- they required additional evidence-link fanout and storage churn
- they made ingestion failures harder to localize
- they made the report layer depend on too many intermediate assumptions

These layers are not being replaced one-for-one.

Instead:

- important detail should live directly in normalized observations
- synthesis should move upward into scheduled report jobs

## 4.1 Removed storage and routes

The simplified implementation has now removed the old active storage and route surface for:

- `reflection_state_estimates`
- `reflection_episodes`
- `reflection_pattern_hypotheses`
- `reflection_context_snapshots`
- `reflection_context_heads`
- `reflection_links`
- `reflection_daily_rollups`
- `reflection_timeline_items`
- `reflection_pattern_rollups`
- `reflection_intervention_plans`
- `reflection_intervention_outcomes`
- `reflection_intervention_effectiveness`

The reflection HTTP surface no longer exposes:

- `/v1/reflection/state-estimates`
- `/v1/reflection/episodes`
- `/v1/reflection/patterns`
- `/v1/reflection/context`

---

## 5. Current Normalize Strategy

## 5.1 Git today

Current Git normalize is already close to the target shape.

One raw Git commit payload becomes one normalized observation:

- `kind = "git_commit"`

That normalized row keeps:

- repo identity
- branch
- sha
- commit subject and message
- file counts and diff stats
- touched paths and touched areas

This can stay mostly unchanged.

## 5.2 Codex today

Current Codex normalize is too fragmented for the simplified target.

One raw Codex turn currently becomes:

- `codex_turn`
- optional `codex_edit_batch`
- optional `codex_failure_event`

That split was designed for the now-removed middle layers.

For the simplified report-first design, this is unnecessary.

---

## 6. Target Normalize Strategy

## 6.1 Git target

Git remains:

- one raw commit
- one `git_commit` observation

No major conceptual change is needed.

## 6.2 Codex target

Codex should become:

- one raw turn transcript
- one `codex_turn` observation

The `codex_turn` observation should keep:

- summary
- tags
- metrics
- purified report-facing transcript projection in `content`

It should not split into separate normalized artifacts for:

- edit batch
- failure event

Those become fields inside the same `codex_turn` row.

## 6.3 Codex content rule

The target rule is:

- `raw.payload.rawTurn` remains the exact replay anchor
- `observation.content` keeps the purified report-facing transcript projection
- `observation.content` does **not** duplicate the raw opaque `rawTurn` blob

Recommended `codex_turn.content` fields:

- `sessionId`
- `threadId`
- `turnId`
- `turnStatus`
- `startedAt`
- `completedAt`
- `cwd`
- `source`
- `modelProvider`
- `model`
- `threadTitle`
- `reportTranscript`
- `fileChanges`
- `metrics`
- `tags`

This makes normalized observations rich enough for report jobs while keeping raw and normalized roles separate.

---

## 7. Target Report Model

## 7.1 Daily

`daily` report is generated from:

- normalized observations in one local-calendar day window
- transcript-first Codex input projected from those observations
- optional lighter deterministic context from other sources
- LLM synthesis over that daily transcript set

This becomes the main synthesis layer.

## 7.2 Weekly

`weekly` report is generated from:

- the set of `daily` reports inside that week
- optional lightweight weekly aggregates

It should not rebuild long-horizon meaning from raw observations directly.

## 7.3 Monthly

`monthly` report is generated from:

- the set of `daily` reports inside that month
- optional lightweight monthly aggregates

It should also not depend directly on the removed middle layers.

---

## 8. Scheduling Model

The target scheduler model is:

- ingestion writes raw observations
- ingestion rebuilds normalized observations
- ingestion marks affected report periods dirty
- scheduled or manual jobs generate reports later

Recommended jobs:

- `daily-report-build`
- `weekly-report-build`
- `monthly-report-build`

Recommended triggers:

- end-of-day scheduled build for daily reports
- daily report changes mark containing week and month dirty
- manual rebuild remains available

---

## 9. Links And Storage Impact

The simplified design should not depend on `reflection_links`.

Instead:

- daily reports can store `sourceObservationIds`
- weekly and monthly reports can later store `sourceDailyReportIds`

That is enough provenance for the current system without reintroducing lineage-table fanout.

---

## 10. Migration Direction

The refactor should happen in this order:

1. Align docs and contracts around the simplified model.
2. Simplify Codex normalize to one `codex_turn`.
3. Stop running state / episode / pattern / context stages from ingestion.
4. Redesign report jobs around normalized observations and daily-report rollups.
5. Delete or deprecate obsolete tables, jobs, and links once the new path is stable.

---

## 11. Decision Summary

The aligned target intent is:

- keep `raw_observation`
- keep `observation`
- simplify Codex normalize to one rich `codex_turn`
- keep Git normalize mostly as-is
- remove state / episode / pattern / context
- generate daily reports from transcript-first normalized observations plus LLM
- generate weekly and monthly reports from daily reports
- remove `reflection_links` from the target design
- drastically reduce pipeline depth
