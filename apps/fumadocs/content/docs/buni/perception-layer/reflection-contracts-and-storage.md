---
title: "Reflection Contracts And Storage"
---

# Reflection Contracts And Storage

> Status: Partially superseded by simplified reflection design
> Date: 2026-05-04
> Companion docs:
> - [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> - [./reflection-system-architecture.md](./reflection-system-architecture.md)
> - [./reflection-observation-ingestion-pipeline.md](./reflection-observation-ingestion-pipeline.md)
> - [./reflection-state-estimate-pipeline.md](./reflection-state-estimate-pipeline.md)
> - [./reflection-episode-pipeline.md](./reflection-episode-pipeline.md)
> - [./reflection-pattern-hypothesis-pipeline.md](./reflection-pattern-hypothesis-pipeline.md)
> - [./reflection-report-pipeline.md](./reflection-report-pipeline.md)
> - [./reflection-context-pipeline.md](./reflection-context-pipeline.md)
> - [./perception-signal-adapters-v1.md](./perception-signal-adapters-v1.md)
> - [../runtime-kernel-implementation-plan.md](../runtime-kernel-implementation-plan.md)

> Superseded Note:
> This document still contains useful storage context, but its state / episode / pattern / context sections describe the older reflection design.
> The active target simplification is documented in [./reflection-pipeline-simplification.md](./reflection-pipeline-simplification.md).

## 1. Purpose

This document defines the contract and storage design for Buni's reflection system.

It is the companion to [`reflection-system-architecture.md`](./reflection-system-architecture.md).

That document explains the layer model.

This document explains:

- which domain contracts should exist
- how those contracts map to storage
- how provenance and evidence links should work
- which outputs can enter chat turn runtime
- which data should remain outside turn-scoped runtime

The main rule is simple:

**reflection is a longitudinal subsystem with its own storage model, not an extension of turn-time `SignalSet`.**

---

## 2. Design Rules

### 2.1 Raw first, interpretation later

The system should preserve a strict progression:

```text
RawObservation
  -> Observation
  -> StateEstimate
  -> Episode
  -> PatternHypothesis
  -> ReflectionReport
  -> InterventionPlan / InterventionOutcome
  -> ReflectionContext
  -> optional ReflectionSignal projection
```

Each stage should have its own contract and storage boundary.

### 2.2 Functional core, imperative shell

Pure code should own:

- normalization
- state inference
- episode segmentation
- pattern inference
- report synthesis inputs
- context projection

Imperative code should own:

- connector IO
- polling and webhook handling
- persistence
- job scheduling
- notification delivery

### 2.3 Rebuildability beats migration complexity

This system is early-stage and should optimize for structural clarity.

That means:

- raw ingestion logs are append-first
- normalized and derived artifacts are rebuildable
- we do not design around backward compatibility
- we do not overload existing memory tables to avoid adding proper reflection tables

### 2.4 Evidence must stay traceable

Every derived artifact should be traceable back to supporting lower-level artifacts.

The system should always be able to answer:

- which observations supported this episode
- which episodes supported this pattern
- which patterns and episodes supported this report
- which intervention was evaluated against which follow-up observations

### 2.5 Runtime consumes compressed reflection context

Chat turn runtime should not load full reports, full raw timelines, or the whole reflection graph.

Turn runtime should consume:

- `ReflectionContext`
- optional `ReflectionSignal[]` derived from that context

It should not consume:

- full `ReflectionReport` bodies
- raw observation payloads
- arbitrary reflection job history

---

## 3. Contract Taxonomy

## 3.1 Shared base contracts

These should be reused across the reflection package.

```ts
type ReflectionArtifactKind =
  | "raw_observation"
  | "observation"
  | "state_estimate"
  | "episode"
  | "pattern_hypothesis"
  | "reflection_report"
  | "intervention_plan"
  | "intervention_outcome"
  | "context_snapshot";

type TimeWindow = {
  startedAt: string;
  endedAt: string | null;
};

type EvidenceRef = {
  artifactKind: ReflectionArtifactKind;
  artifactId: string;
  role: string;
  confidence: number | null;
  weight: number | null;
};

type ProvenanceRef = {
  sourceKind: string;
  sourceId: string;
  externalId: string | null;
  capturedAt: string | null;
  metadata: Record<string, unknown>;
};
```

Notes:

- `TimeWindow` should be explicit on every temporal artifact.
- `EvidenceRef` is for contract-level explanation and read models.
- storage should keep canonical links in a dedicated link table, not only inside JSON.

## 3.2 Connector and ingestion contracts

These contracts belong to the shell boundary, not the pure reasoning core.

```ts
type ObservationSourceKind =
  | "screen_time"
  | "app_usage"
  | "health"
  | "gps"
  | "browser"
  | "podcast"
  | "video"
  | "journal"
  | "voice_note"
  | "meeting"
  | "emotion_tag"
  | "git";

type ObservationSourceConfig = {
  id: string;
  profileId: string;
  sourceKind: ObservationSourceKind;
  connectorKind: string;
  status: "active" | "paused" | "error";
  syncMode: "poll" | "webhook" | "import";
  granularity: "event" | "session" | "daily_rollup";
  secretRef: string | null;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type SourceSyncState = {
  id: string;
  sourceConfigId: string;
  profileId: string;
  cursor: Record<string, unknown>;
  lastEventAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: Record<string, unknown> | null;
};

type ReflectionJobRun = {
  id: string;
  profileId: string;
  jobKind:
    | "ingest"
    | "normalize"
    | "state_estimation"
    | "episode_build"
    | "pattern_inference"
    | "report_build"
    | "context_build"
    | "intervention_evaluation";
  status: "queued" | "running" | "succeeded" | "failed";
  targetWindow: TimeWindow;
  pipelineVersion: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  startedAt: string;
  endedAt: string | null;
};
```

## 3.3 Canonical observation contracts

`RawObservation` is provider-shaped.

`Observation` is domain-shaped.

```ts
type RawObservation = {
  id: string;
  profileId: string;
  sourceConfigId: string | null;
  sourceKind: ObservationSourceKind;
  externalId: string | null;
  dedupeKey: string;
  capturedAt: string;
  occurredAt: TimeWindow;
  payload: Record<string, unknown>;
  provenance: ProvenanceRef[];
  createdAt: string;
};

type ObservationCategory =
  | "behavior"
  | "physiology"
  | "location"
  | "consumption"
  | "thought"
  | "emotion"
  | "work";

type Observation = {
  id: string;
  profileId: string;
  sourceKind: ObservationSourceKind;
  category: ObservationCategory;
  kind: string;
  window: TimeWindow;
  summary: string;
  tags: string[];
  metrics: Record<string, number | string | boolean | null>;
  content: Record<string, unknown>;
  confidence: number;
  canonicalHash: string;
  provenance: ProvenanceRef[];
  createdAt: string;
  updatedAt: string;
};
```

Design choice:

- `kind` stays open because source families will evolve quickly.
- `category` stays small and queryable.
- `metrics` holds compact queryable values such as duration, count, distance, valence, or intensity.
- `content` holds source-specific structured detail without forcing one giant enum too early.

## 3.4 Derived artifact contracts

The derived layer should become more structured as it moves upward.

`StateEstimate` should be one dimension per row, not one giant window object.

That keeps dimensions extensible and storage simpler.

```ts
type StateDimension =
  | "energy"
  | "stress"
  | "focus"
  | "uncertainty"
  | "social_load"
  | "emotional_volatility"
  | "recovery_pressure";

type StateEstimate = {
  id: string;
  profileId: string;
  dimension: StateDimension;
  window: TimeWindow;
  value: number;
  baseline: number | null;
  direction: "up" | "down" | "flat" | null;
  summary: string;
  confidence: number;
  details: Record<string, unknown>;
  createdAt: string;
};

type Episode = {
  id: string;
  profileId: string;
  kind: string;
  status: "candidate" | "active" | "closed" | "discarded";
  window: TimeWindow;
  summary: string;
  storyBeats: Array<{
    ts: string;
    label: string;
    evidence: EvidenceRef[];
  }>;
  tags: string[];
  confidence: number;
  details: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type PatternHypothesis = {
  id: string;
  profileId: string;
  kind: string;
  status: "candidate" | "active" | "weakening" | "retired" | "rejected";
  statement: string;
  triggerDescription: string;
  mechanismDescription: string;
  counterevidenceDescription: string | null;
  activeWindow: TimeWindow;
  confidence: number;
  metrics: Record<string, number | string | boolean | null>;
  createdAt: string;
  updatedAt: string;
};

type ReflectionReport = {
  id: string;
  profileId: string;
  period: "daily" | "weekly" | "monthly";
  window: TimeWindow;
  status: "draft" | "final";
  summary: string;
  facts: string[];
  patterns: string[];
  metaCognition: string[];
  recommendations: string[];
  confidence: number;
  createdAt: string;
};

type InterventionPlan = {
  id: string;
  profileId: string;
  goal: string;
  style: "gentle_redirect" | "resource_push" | "recovery_prompt" | "focus_prompt";
  status: "proposed" | "scheduled" | "delivered" | "cancelled";
  actions: Array<{
    kind: string;
    content: string;
    channel: "chat" | "notification" | "dashboard";
  }>;
  sourceWindow: TimeWindow;
  createdAt: string;
  updatedAt: string;
};

type InterventionOutcome = {
  id: string;
  profileId: string;
  interventionPlanId: string;
  observedAt: string;
  outcome:
    | "accepted"
    | "ignored"
    | "dismissed"
    | "partially_effective"
    | "effective";
  summary: string;
  effectivenessScore: number | null;
  notes: Record<string, unknown> | null;
  createdAt: string;
};
```

## 3.5 Runtime integration contracts

This is the only reflection output that chat turn runtime should load directly.

```ts
type ReflectionContext = {
  id: string;
  profileId: string;
  generatedAt: string;
  window: TimeWindow;
  currentState: Partial<
    Record<
      StateDimension,
      {
        value: number;
        confidence: number;
        summary: string;
      }
    >
  >;
  activePatterns: Array<{
    patternId: string;
    kind: string;
    statement: string;
    confidence: number;
    lastSeenAt: string | null;
  }>;
  recentEpisodes: Array<{
    episodeId: string;
    kind: string;
    summary: string;
    endedAt: string | null;
  }>;
  coachingNotes: string[];
  interventionPreferences: Array<{
    label: string;
    confidence: number;
  }>;
  sourceReportIds: string[];
};

type ReflectionSignal = {
  kind: "pattern_activation" | "state_pressure" | "coaching_opportunity";
  score: number;
  summary: string;
  sourceContextId: string;
  sourcePatternIds: string[];
  sourceEpisodeIds: string[];
  metadata: Record<string, unknown>;
};
```

Rules:

- `ReflectionContext` is durable and stored.
- `ReflectionSignal` is an adapter product. It can be derived on load from `ReflectionContext`.
- turn runtime should prefer loading one latest context snapshot, then project zero or more reflection signals from it.

---

## 4. Suggested Contract File Layout

Suggested contract surface:

```text
packages/contracts/src/reflection/
  source.ts
  observation.ts
  state.ts
  episode.ts
  pattern.ts
  report.ts
  intervention.ts
  context.ts
  jobs.ts
  read-model.ts
  index.ts
```

Suggested ownership:

- `source.ts`: source kinds, source config, sync state
- `observation.ts`: raw observation, observation, provenance
- `state.ts`: dimensions and state estimate
- `episode.ts`: episode and story beat contracts
- `pattern.ts`: pattern hypothesis and status
- `report.ts`: reflection report and period contracts
- `intervention.ts`: plan and outcome contracts
- `context.ts`: reflection context and reflection signal
- `jobs.ts`: job kinds and job run contracts
- `read-model.ts`: visualization-facing projections

Root export should later add:

```ts
export * from "./reflection";
```

---

## 5. Storage Model

## 5.1 Storage goals

Storage should support five things at once:

1. append-first ingestion
2. rebuildable derived layers
3. evidence tracing
4. fast visualization queries
5. lightweight runtime loading

## 5.2 Table families

Suggested schema files:

```text
packages/db/src/schema/
  reflection-source-configs.ts
  reflection-source-sync-states.ts
  reflection-job-runs.ts
  reflection-raw-observations.ts
  reflection-observations.ts
  reflection-state-estimates.ts
  reflection-episodes.ts
  reflection-pattern-hypotheses.ts
  reflection-reports.ts
  reflection-intervention-plans.ts
  reflection-intervention-outcomes.ts
  reflection-context-snapshots.ts
  reflection-links.ts
  reflection-timeline-items.ts
  reflection-daily-rollups.ts
  reflection-pattern-rollups.ts
  reflection-intervention-effectiveness.ts
```

Core rule:

- explicit tables for core artifacts
- one generic link table for cross-artifact provenance and evidence
- separate read-model tables for UI and runtime speed

## 5.3 Canonical tables

### `reflection_source_configs`

Purpose:

- store connector setup per profile and source family

Key columns:

- `id`
- `profile_id`
- `source_kind`
- `connector_kind`
- `status`
- `sync_mode`
- `granularity`
- `secret_ref`
- `settings_json`
- `created_at`
- `updated_at`

Notes:

- do not store raw secrets in this table
- `secret_ref` should point to secure config storage

### `reflection_source_sync_states`

Purpose:

- keep connector cursor and sync health separate from config

Key columns:

- `id`
- `source_config_id`
- `profile_id`
- `cursor_json`
- `last_event_at`
- `last_success_at`
- `last_error_at`
- `last_error_json`

### `reflection_job_runs`

Purpose:

- observe pipeline execution and window rebuilds

Key columns:

- `id`
- `profile_id`
- `job_kind`
- `status`
- `target_window_start`
- `target_window_end`
- `pipeline_version`
- `input_json`
- `output_json`
- `error_json`
- `started_at`
- `ended_at`

### `reflection_raw_observations`

Purpose:

- append provider-shaped events before normalization

Key columns:

- `id`
- `profile_id`
- `source_config_id`
- `source_kind`
- `external_id`
- `dedupe_key`
- `captured_at`
- `occurred_at_start`
- `occurred_at_end`
- `payload_json`
- `provenance_json`
- `created_at`

Index expectations:

- `(profile_id, source_kind, captured_at)`
- `(profile_id, dedupe_key)`
- `(source_config_id, captured_at)`

### `reflection_observations`

Purpose:

- durable normalized observations

Key columns:

- `id`
- `profile_id`
- `source_kind`
- `category`
- `kind`
- `summary`
- `window_start`
- `window_end`
- `confidence`
- `canonical_hash`
- `tags_json`
- `metrics_json`
- `content_json`
- `provenance_json`
- `pipeline_version`
- `created_at`
- `updated_at`

Index expectations:

- `(profile_id, window_start)`
- `(profile_id, category, window_start)`
- `(profile_id, source_kind, window_start)`

### `reflection_state_estimates`

Purpose:

- persist inferred latent state by dimension and window

Key columns:

- `id`
- `profile_id`
- `dimension`
- `window_start`
- `window_end`
- `value`
- `baseline`
- `direction`
- `summary`
- `confidence`
- `details_json`
- `pipeline_version`
- `created_at`

### `reflection_episodes`

Purpose:

- narrative units for timeline and reflection

Key columns:

- `id`
- `profile_id`
- `kind`
- `status`
- `window_start`
- `window_end`
- `summary`
- `story_json`
- `tags_json`
- `details_json`
- `confidence`
- `pipeline_version`
- `created_at`
- `updated_at`

### `reflection_pattern_hypotheses`

Purpose:

- repeated hypotheses and mechanism candidates

Key columns:

- `id`
- `profile_id`
- `kind`
- `status`
- `statement`
- `trigger_description`
- `mechanism_description`
- `counterevidence_description`
- `active_window_start`
- `active_window_end`
- `confidence`
- `metrics_json`
- `pipeline_version`
- `created_at`
- `updated_at`

### `reflection_reports`

Purpose:

- store daily, weekly, and monthly synthesis artifacts

Key columns:

- `id`
- `profile_id`
- `period`
- `status`
- `window_start`
- `window_end`
- `summary`
- `facts_json`
- `patterns_json`
- `metacognition_json`
- `recommendations_json`
- `confidence`
- `pipeline_version`
- `created_at`

### `reflection_intervention_plans`

Purpose:

- persist proposed or delivered coaching actions

Key columns:

- `id`
- `profile_id`
- `goal`
- `style`
- `status`
- `actions_json`
- `source_window_start`
- `source_window_end`
- `pipeline_version`
- `created_at`
- `updated_at`

### `reflection_intervention_outcomes`

Purpose:

- record whether the intervention helped

Key columns:

- `id`
- `profile_id`
- `plan_id`
- `outcome`
- `observed_at`
- `summary`
- `effectiveness_score`
- `notes_json`
- `created_at`

### `reflection_context_snapshots`

Purpose:

- store the compressed reflection state that runtime can load cheaply

Key columns:

- `id`
- `profile_id`
- `status`
- `window_start`
- `window_end`
- `generated_at`
- `current_state_json`
- `active_patterns_json`
- `recent_episodes_json`
- `coaching_notes_json`
- `intervention_preferences_json`
- `source_report_ids_json`
- `pipeline_version`
- `created_at`

Index expectations:

- `(profile_id, generated_at)`
- `(profile_id, status, generated_at)`

---

## 6. Link Model And Provenance

## 6.1 Why a generic link table

The reflection system needs a dense evidence graph:

- raw observation -> observation
- observation -> state estimate
- observation -> episode
- state estimate -> episode
- episode -> pattern
- episode -> report
- pattern -> report
- report -> context snapshot
- plan -> outcome
- outcome -> follow-up observation

Creating a dedicated join table for every edge type will become noisy very quickly.

For reflection, a generic typed link table is the better default.

## 6.2 `reflection_links`

Suggested columns:

- `id`
- `profile_id`
- `from_kind`
- `from_id`
- `to_kind`
- `to_id`
- `role`
- `sort_order`
- `weight`
- `confidence`
- `metadata_json`
- `created_at`

Suggested roles:

- `normalized_from`
- `supported_by`
- `state_input`
- `episode_input`
- `pattern_evidence`
- `report_evidence`
- `context_source`
- `plan_source`
- `outcome_evidence`

Index expectations:

- `(profile_id, from_kind, from_id, role)`
- `(profile_id, to_kind, to_id, role)`

Tradeoff:

- we lose hard SQL foreign keys across heterogeneous kinds
- we gain a much cleaner cross-artifact provenance model

That trade is acceptable in this early-stage system.

If some relationships become extremely hot later, we can split them into dedicated link tables without changing the domain model.

---

## 7. Retention, Rebuild, And Lifecycle

## 7.1 Source of truth tiers

The storage tiers should be treated differently.

Tier 1:

- `reflection_raw_observations`
- append-first operational history
- best source for rebuilds and debugging connector bugs

Tier 2:

- `reflection_observations`
- durable canonical longitudinal record
- primary source for visualization and higher reasoning

Tier 3:

- state estimates, episodes, patterns, reports, plans, outcomes, context snapshots
- derived artifacts
- rebuildable when heuristics or models change

## 7.2 Rebuild policy

Preferred rebuild unit:

- per profile
- per bounded time window
- per pipeline version

That means a new pattern engine should be able to:

1. select observations in a window
2. delete or archive derived artifacts in that window
3. regenerate state, episodes, patterns, reports, and context snapshots
4. keep raw observations intact

## 7.3 Retention policy

Default policy direction:

- keep raw observations as long as storage allows during early development
- keep observations indefinitely
- keep derived artifacts indefinitely until a rebuild replaces them
- allow source-specific compaction later if payloads get too large

Important:

- do not design around preserving obsolete derived rows forever
- replacing derived rows with a cleaner pipeline version is expected behavior

---

## 8. Read Models For Visualization

UI should not assemble every screen from deep artifact joins.

We should maintain dedicated read-model tables.

### `reflection_timeline_items`

Purpose:

- mixed timeline of observations, episodes, reports, and interventions

Useful columns:

- `id`
- `profile_id`
- `item_kind`
- `source_artifact_kind`
- `source_artifact_id`
- `occurred_at`
- `title`
- `summary`
- `score`
- `tags_json`
- `payload_json`

### `reflection_daily_rollups`

Purpose:

- day-level overview cards and dashboard summaries

Useful columns:

- `id`
- `profile_id`
- `date_key`
- `sleep_summary_json`
- `work_summary_json`
- `emotion_summary_json`
- `movement_summary_json`
- `consumption_summary_json`
- `top_episode_ids_json`
- `top_pattern_ids_json`
- `updated_at`

### `reflection_pattern_rollups`

Purpose:

- show repetition count, last seen time, confidence trend, and intervention impact

Useful columns:

- `id`
- `profile_id`
- `pattern_id`
- `first_seen_at`
- `last_seen_at`
- `occurrence_count`
- `confidence_trend_json`
- `linked_outcome_summary_json`
- `updated_at`

### `reflection_intervention_effectiveness`

Purpose:

- track which coaching styles and actions work

Useful columns:

- `id`
- `profile_id`
- `action_kind`
- `style`
- `sample_size`
- `effective_count`
- `dismissed_count`
- `mean_effectiveness_score`
- `updated_at`

Rule:

- read models are disposable and rebuildable
- canonical artifact tables remain the source of truth

---

## 9. Runtime Integration Shape

The runtime boundary should stay narrow.

Suggested server load path:

```text
load latest reflection_context_snapshot
  -> project ReflectionSignal[]
  -> merge into TurnContext as reflection context block
```

Suggested `TurnContext` direction:

```ts
type TurnContext = {
  input: TurnInput;
  recentUserTexts: string[];
  signals: SignalSet;
  signalContext: SignalContext;
  unresolvedSlices: MemorySlice[];
  recentSlices: MemorySlice[];
  reflectionContext: ReflectionContext | null;
  previousRuntimeState: PreviousRuntimeState | null;
};
```

Important boundary decisions:

- full `ReflectionReport` does not go into `TurnContext`
- raw observations do not go into `TurnContext`
- runtime does not query reflection tables ad hoc during provider streaming
- if runtime wants reflection-shaped hints, it derives them from `reflectionContext`

This keeps chat turn runtime fast and interpretable.

---

## 10. Phase 1 Schema Scope

Phase 1 should not try to ship the whole supervision loop at once.

Recommended Phase 1 tables:

- `reflection_source_configs`
- `reflection_source_sync_states`
- `reflection_job_runs`
- `reflection_raw_observations`
- `reflection_observations`
- `reflection_state_estimates`
- `reflection_episodes`
- `reflection_pattern_hypotheses`
- `reflection_reports`
- `reflection_context_snapshots`
- `reflection_links`
- `reflection_timeline_items`
- `reflection_daily_rollups`

Phase 2 can add:

- `reflection_intervention_plans`
- `reflection_intervention_outcomes`
- `reflection_pattern_rollups`
- `reflection_intervention_effectiveness`

This gives us a clean order:

1. continuous data collection
2. canonical observation storage
3. episode and pattern reasoning
4. periodic reflection reports
5. runtime context projection
6. intervention loop

---

## 11. Summary

The reflection system should be modeled as its own longitudinal data plane.

The key design decisions are:

- explicit contracts for each reasoning stage
- explicit storage tables for core artifacts
- one generic provenance link table
- dedicated read models for visualization
- `ReflectionContext` as the only direct runtime integration surface
- `ReflectionSignal` as an optional projection, not the source of truth

That gives us a reflection architecture that is explainable, rebuildable, and compatible with the existing functional-core runtime direction.
