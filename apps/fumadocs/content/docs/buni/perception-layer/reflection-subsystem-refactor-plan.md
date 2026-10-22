---
title: "Reflection Subsystem Refactor Plan"
---

# Reflection Subsystem Refactor Plan

> Status: Superseded by simplified reflection design
> Date: 2026-05-04
> Companion docs:
> - [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> - [./reflection-system-architecture.md](./reflection-system-architecture.md)
> - [./reflection-report-pipeline.md](./reflection-report-pipeline.md)
> - [./reflection-context-pipeline.md](./reflection-context-pipeline.md)
> - [./reflection-comparison-signal-projection.md](./reflection-comparison-signal-projection.md)

> Superseded Note:
> This refactor plan targets the older reflection design with state, episode, pattern, and context layers.
> The active target architecture is now [./reflection-pipeline-simplification.md](./reflection-pipeline-simplification.md), which reduces reflection to `raw_observation -> observation -> report`.

## 1. Purpose

This document turns the current reflection subsystem review into a concrete refactor plan.

The goal is not to redesign the subsystem.

The goal is to remove the remaining places where the current implementation can drift away from the intended boundaries:

- reports should surface canonical, current patterns instead of raw overlapping rows
- comparison should preserve surfaced continuity, not only raw adjacent-window math
- artifact replacement should be atomic
- import should not fail wholesale because downstream report or context rebuilds had a bad run
- context should rank for present relevance, not only confidence
- pattern semantics should have one explicit source of truth

## 2. Remaining Problems

### 2.1 Report pattern selection is still too raw

The report builder should not rank every overlapping pattern equally.

It needs an explicit selection policy that distinguishes:

- `active` patterns worth surfacing now
- `weakening` patterns worth surfacing for change detection
- high-confidence `candidate` patterns that may be strong enough to mention
- `retired` and `rejected` patterns that may matter for comparison but should not dominate report surface sections

### 2.2 Prior-period comparison is not surfaced-continuity-aware

Raw prior-window artifacts are still useful, but they are not the whole story.

If the previous same-period report surfaced only a subset of prior patterns, current comparison should be able to use that surfaced subset as the comparison baseline.

This improves:

- auditability
- continuity across daily, weekly, and monthly reports
- interpretability of "new" versus "still present but previously unsurfaced"

### 2.3 Report and pattern replacement are still vulnerable to delete-before-insert gaps

Context activation already needs atomicity, but report and pattern replacement need it too.

Otherwise:

- link rows can be deleted
- artifact rows can be deleted
- inserts can fail

and the target window is temporarily left empty.

### 2.4 Import orchestration has too much downstream blast radius

Manual import should treat report and context refresh as downstream rebuilds, not as reasons to invalidate the whole import.

If raw append, normalize, state, episode, and pattern derivation succeed, the import itself should succeed even if:

- one report period rebuild fails
- context compression fails

Those failures should be captured as downstream issues instead.

### 2.5 Context ranking is bounded but still too confidence-heavy

Context input loading is now horizon-bounded, but compression still needs a relevance score that combines:

- confidence
- recency inside the context horizon
- status bias such as `active` over `weakening`

### 2.6 Pattern semantics still leak across modules

Runtime and report both need explicit pattern semantics.

Those semantics should live in one shared layer, including:

- valence
- trajectory
- default meta-cognition phrasing
- default recommendation phrasing

## 3. Target Refactor

### 3.1 Explicit report selection policy

Add a pure report selection module in `packages/core` that:

- scores patterns by confidence, status, recency, and comparison movement
- filters out non-surfaceable statuses by default
- allows strong candidates only above explicit thresholds
- returns the bounded set of patterns used for report surface sections and evidence links

### 3.2 Surfaced comparison continuity

When available, report comparison should use the previous same-period report as an explicit source of comparison intent.

Implementation direction:

- load the previous same-period report
- load its evidence links
- derive the set of prior surfaced pattern kinds
- prefer that surfaced subset as the prior comparison baseline
- fall back to raw prior-window patterns when no surfaced baseline exists

The comparison result should carry explicit metadata about whether it came from:

- `prior_report_surface`
- `raw_window`

### 3.3 Atomic artifact replacement

All replace-style reflection repos should write in one transaction.

This includes:

- context head advancement
- report replacement for one period window
- pattern replacement for one overlap window

### 3.4 Best-effort downstream rebuilds during import

Import should keep a hard failure boundary around:

- raw ingestion
- normalization
- state estimation
- episode construction
- pattern horizon construction

Report and context refresh should run as downstream best-effort rebuilds:

- successful results are returned immediately
- failures are recorded as structured downstream issues
- the import response remains usable

### 3.5 Recency-aware context scoring

Context compression should keep a bounded horizon and then score within that horizon by:

- confidence
- recency to the anchor
- status weight

This prevents stale-but-confident patterns from outcompeting fresher present-relevant ones.

### 3.6 Shared pattern semantic helpers

Extend the shared pattern semantic layer so report code can consume the same explicit semantics runtime already uses.

That layer should now own:

- `classifyPatternValence`
- `derivePatternTrajectory`
- default meta-cognition helpers
- default recommendation helpers

## 4. File-Level Plan

### 4.1 `packages/core`

- add report selection helpers under `reflection/report/`
- route report pattern ranking through that policy
- move report narrative defaults onto the shared pattern semantic module
- make context pattern scoring recency-aware

### 4.2 `packages/db`

- keep `reflection_context_heads` as the current head model
- make report replacement transactional
- make pattern replacement transactional
- expose a query for the previous same-period report so comparison can reference surfaced history

### 4.3 `apps/server`

- update report orchestration to load previous report links and derive comparison source
- update import orchestration so report/context failures are isolated as downstream issues
- keep runtime consuming only `ReflectionContext` plus runtime-projected reflection signals

## 5. Initial Acceptance Criteria

The refactor is considered complete when:

1. daily and weekly reports no longer surface `rejected` or weak `candidate` patterns as top report patterns
2. monthly comparison can explicitly say it is comparing against the prior surfaced report when that source exists
3. report and pattern replace operations no longer leave delete-before-insert gaps
4. manual import can return partial downstream failures without losing the successful ingest and upstream derivations
5. context ranking prefers fresher relevant patterns over merely older higher-confidence ones inside the horizon
6. report and runtime both depend on the same shared pattern semantic helpers

## 6. Follow-Up Work

Likely next steps after this refactor:

- persist richer comparison provenance for UI/debug inspection
- promote report and context policies to explicit versioned contracts
- move report/context rebuild triggering onto a dirty-window job queue instead of request-time fanout
- add dedicated review tools for inspecting why a pattern was surfaced or suppressed
