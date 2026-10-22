---
title: "Reflection Episode Pipeline"
---

# Reflection Episode Pipeline

> Status: Superseded by simplified reflection design
> Date: 2026-05-04
> Companion docs:
> - [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> - [./reflection-system-architecture.md](./reflection-system-architecture.md)
> - [./reflection-contracts-and-storage.md](./reflection-contracts-and-storage.md)
> - [./reflection-observation-ingestion-pipeline.md](./reflection-observation-ingestion-pipeline.md)
> - [./reflection-state-estimate-pipeline.md](./reflection-state-estimate-pipeline.md)
> - [./reflection-pattern-hypothesis-pipeline.md](./reflection-pattern-hypothesis-pipeline.md)
> - [./reflection-report-pipeline.md](./reflection-report-pipeline.md)
> - [./reflection-context-pipeline.md](./reflection-context-pipeline.md)

> Superseded Note:
> The active target reflection design removes the episode layer.
> Use [./reflection-pipeline-simplification.md](./reflection-pipeline-simplification.md) for the current direction.

## 1. Purpose

This document defines the episode-building layer that sits between state estimation and pattern inference.

It answers one question:

**which observations and state windows belong to the same interpretable narrative slice?**

This document defines:

- what `Episode` means
- where the boundary sits between state, episode, and pattern
- how episode segmentation should work
- how cross-source stitching should work
- how ongoing episode tails should be handled
- how episode kinds should be assigned
- how summaries, story beats, and evidence links should be built
- how episode rebuild and replacement should work

It does not define:

- long-range causal pattern inference
- daily or weekly report generation
- intervention planning

---

## 2. Core Decision

The episode layer is the first narrative layer.

That means:

- it may compose multiple observations and state estimates into one unit
- it may assign a narrative episode kind
- it may summarize a local sequence as a coherent slice

But it must stop before long-range interpretation.

So the conceptual stack is:

```text
Observation
  -> StateEstimate
  -> Episode
  -> PatternHypothesis
```

The boundary is:

- `StateEstimate` says what the likely internal state was
- `Episode` says what local narrative unit formed
- `PatternHypothesis` says what repeated or causal mechanism may exist across episodes

This is the key design rule for episode pipeline.

If episode starts inferring cross-day causal mechanisms, it has become pattern inference.

If episode starts recomputing latent state, it has collapsed into state estimation.

---

## 3. Boundary Definition

## 3.1 Input boundary

Episode pipeline consumes:

- canonical `Observation`
- `StateEstimate`
- optional neighboring episode tail context

It does not consume:

- reports
- interventions
- pattern hypotheses

## 3.2 Output boundary

Episode pipeline produces:

- `Episode`
- episode evidence links
- downstream dirty windows for pattern inference

## 3.3 What episode is allowed to say

Episode is allowed to say things like:

- deep work block
- shallow drift block
- meeting-heavy depletion block
- recovery block
- decision-friction block
- late-night rumination block

Episode is not allowed to say things like:

- this proves an avoidance coping strategy
- this is a recurring uncertainty-defense mechanism
- this pattern has strengthened over the last three weeks

Those belong to `PatternHypothesis` and reflection reporting.

## 3.4 V1 semantic posture

V1 episodes should remain:

- descriptive
- local
- evidence-backed
- modest in interpretation

This means the pipeline should prefer:

- `deep_work_block`
- `shallow_drift_block`
- `meeting_load_block`
- `recovery_block`
- `decision_friction_block`

over more mechanism-heavy labels such as:

- `avoidance_loop`
- `self-protective_learning_loop`

Those can exist later, but V1 should first stabilize descriptive episode quality.

---

## 4. Episode Contract Meaning

The current contract direction is sound:

```ts
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
```

Interpretation rules:

- `kind` is the local narrative classification
- `status` captures lifecycle, especially right-edge episodes still in progress
- `window` is the bounded temporal span of the episode
- `summary` is a local explanation, not a cross-day diagnosis
- `storyBeats` are the compressed narrative structure of the episode
- `confidence` is confidence in episode assembly and classification
- `details` holds segmentation, scoring, and continuity metadata

`Episode` should be a durable artifact, not just a UI projection.

---

## 5. Episode Lifecycle

## 5.1 Status model

The existing statuses are enough:

- `candidate`
- `active`
- `closed`
- `discarded`

## 5.2 Status meaning

### `candidate`

Meaning:

- provisional result during a rebuild
- not yet accepted as a surfaced durable episode

V1 recommendation:

- `candidate` may stay internal to pipeline execution
- if persisted for debug, it should be treated as non-canonical

### `active`

Meaning:

- the episode touches the right edge of the currently processed time range
- the system believes the narrative slice is still ongoing

Examples:

- ongoing deep work block
- ongoing shallow drift session
- ongoing meeting-load sequence

### `closed`

Meaning:

- the episode has a stable end boundary
- it is safe to use for pattern inference and reporting

### `discarded`

Meaning:

- a candidate cluster did not meet surfacing quality or duration rules

Examples:

- too little evidence
- too short after smoothing
- contradictory evidence overwhelmed classification

## 5.3 Canonical rule

Only `active` and `closed` should be treated as canonical surfaced episodes.

`candidate` and `discarded` are pipeline-internal or debugging artifacts.

---

## 6. Inputs

## 6.1 Required inputs

Episode pipeline should require:

- observations in target window
- state estimates in target window

This preserves the observation -> state -> episode layering.

## 6.2 Supporting inputs

Episode pipeline may also use:

- left-lookback observations and state estimates
- existing right-edge `active` episode that overlaps the rebuild boundary
- profile timezone and day-part context

Important:

- episode should not depend on future pattern output
- episode should not directly depend on intervention history

## 6.3 Continuity tail input

To avoid broken episodes at window boundaries, the pipeline should load a small continuity tail.

Suggested tail inputs:

- the latest overlapping `active` episode if one exists
- lookback observations
- lookback state windows

This allows a rebuild to decide whether the new window:

- extends the previous episode
- closes the previous episode
- splits into a new episode

---

## 7. Episode Build Unit

## 7.1 Rebuild unit

Episodes should rebuild by time window.

Suggested rebuild input:

- target window
- episode-stage left lookback
- optional small right lookahead for historical rebuilds
- pipeline version

## 7.2 Why not row-by-row

Episode boundaries are highly contextual.

One new observation can change:

- the likely start boundary
- the likely end boundary
- the best episode kind
- whether two local clusters should merge

So row-by-row append logic is the wrong primitive here.

Episode should use the same rebuild philosophy as observations and state.

## 7.3 Typical window sizing

Recommended V1 operating windows:

- near-real-time rebuild: 2 to 6 hours target window with lookback
- daily rebuild: full day window
- backfill or repair: arbitrary bounded historical window

The system should optimize for correctness, not minimal recomputation.

---

## 8. High-Level Pipeline

```text
State dirty window
  -> load observations + state estimates + continuity tail
  -> build local timeline
  -> detect segment boundaries
  -> stitch segments across sources
  -> classify episode candidates
  -> generate summary and story beats
  -> resolve active vs closed
  -> write Episode rows
  -> write evidence links
  -> emit pattern dirty windows
```

This should remain a small explicit pipeline, not a generic planner.

---

## 9. Timeline Assembly

## 9.1 Unified local timeline

Episode building should start from one local timeline that contains:

- observation intervals
- observation points
- state windows

This timeline is computational only.

It is not a user-facing artifact by itself.

## 9.2 Event normalization for episode builder

The builder should convert inputs into a common local shape such as:

```ts
type EpisodeInputEvent = {
  tsStart: string;
  tsEnd: string | null;
  kind: "observation" | "state";
  subtype: string;
  score: number | null;
  tags: string[];
  evidence: EvidenceRef[];
  payload: Record<string, unknown>;
};
```

This gives the segmentation logic one consistent surface.

## 9.3 Why not build directly from DB rows

Episode logic should not depend on storage layout.

Like the rest of the runtime and reflection stack:

- shell loads rows
- core transforms normalized inputs
- shell persists outputs

---

## 10. Segmentation First

The episode pipeline should be segmentation-first, not classification-first.

The right sequence is:

1. find boundaries
2. form local clusters
3. classify clusters
4. summarize clusters

If classification runs first, it will distort boundary quality.

## 10.1 Boundary sources

Segment boundaries may come from:

- long inactivity gaps
- abrupt source-family transition
- strong state transition
- location or meeting transition
- work-start or work-stop boundary
- sleep start or wake boundary

## 10.2 Boundary scoring

Each potential boundary should get a score from multiple contributors.

Examples:

- no activity for 45 minutes strongly suggests a new segment
- focus drop plus browser fragmentation suggests a segment change
- meeting end followed by no task continuity suggests a segment change

V1 should keep this deterministic and additive.

## 10.3 Minimum surfacing rules

Very short or weak segments should not all become episodes.

Suggested minimum rules:

- minimum duration threshold
- minimum evidence count
- minimum confidence

Segments that fail should either:

- merge into neighbors
- be discarded

---

## 11. Cross-Source Stitching

## 11.1 Why stitching matters

Without stitching, the system will produce disconnected rows such as:

- browser session
- stress window
- journal note
- no git activity

With stitching, the system can produce:

- decision-friction block with elevated uncertainty, browser research, and stalled work output

That is the core value of `Episode`.

## 11.2 Stitching rule

Two local signals should belong to the same episode when they satisfy enough of:

- temporal overlap
- short gap continuity
- shared context
- compatible state trajectory
- compatible narrative direction

## 11.3 Compatible narrative direction

Examples:

- high focus plus sustained work observations are compatible
- browser fragmentation plus falling focus are compatible
- meeting density plus rising social load are compatible

Examples of incompatibility:

- strong deep-work evidence and strong recovery evidence in the same narrow window
- wake transition and sleep continuity in the same slice

## 11.4 Cross-source priority

State does not replace observations.

Observations still anchor the episode.

State windows help explain and merge the slice, but should not create an episode without enough factual anchor.

This prevents episodes from becoming free-floating latent summaries.

---

## 12. Classification Model

## 12.1 Classification happens after segmentation

Once a local segment exists, classification assigns the best local episode kind.

Classification should use:

- observation evidence
- state profile over the segment
- temporal context

## 12.2 V1 episode kinds

Recommended initial set:

- `deep_work_block`
- `shallow_drift_block`
- `meeting_load_block`
- `recovery_block`
- `decision_friction_block`
- `rumination_block`

This set is:

- broad enough to be useful
- narrow enough to stay interpretable

## 12.3 Kind meanings

### `deep_work_block`

High continuity, sustained task evidence, and supportive focus state.

### `shallow_drift_block`

Fragmented low-commitment consumption or switching with weak task continuity and degraded focus.

### `meeting_load_block`

Meeting-heavy interval with elevated social load and limited task continuity.

### `recovery_block`

Rest, decompression, low-demand activity, or post-load downshift with rising recovery relevance.

### `decision_friction_block`

Decision-related uncertainty, research or note revisiting, and weak execution follow-through.

### `rumination_block`

Late or quiet-window inward looping thought activity with elevated emotional or uncertainty pressure.

## 12.4 Classification fallback

Not every segment deserves a rich label.

So classification should allow:

- best known kind
- generic fallback such as `mixed_context_block`
- discard

V1 should prefer a generic fallback over forcing a wrong specific label.

---

## 13. Summary And Story Beats

## 13.1 Summary purpose

Episode summary should explain the local slice in one bounded sentence.

Good summary:

- "A focused implementation block with sustained coding activity and stable focus."

Bad summary:

- "This shows your recurring avoidance pattern."

The latter is pattern inference, not episode summary.

## 13.2 Story beat construction

`storyBeats` should represent the minimum local narrative skeleton.

Good beats:

- work session begins
- focus remains stable
- browser fragmentation increases
- uncertainty note appears

Each beat should link to concrete evidence.

## 13.3 Beat budget

V1 should keep story beats sparse.

Recommended budget:

- 2 to 6 beats per episode

This keeps the artifact readable and useful for later reporting.

---

## 14. Open Tail Handling

## 14.1 Why tails matter

The right edge of the current window is often incomplete.

Without explicit tail handling, the system will:

- prematurely close episodes
- split one real episode into many short pieces
- create unstable pattern inputs

## 14.2 Tail rule

If the episode touches the right edge and there is insufficient evidence of closure:

- keep it as `active`

If a later rebuild shows a stable closure:

- replace the prior `active` episode with a `closed` one or a different merged result

## 14.3 Closure signals

Examples of closure:

- long inactivity gap
- sleep transition
- strong context switch
- meeting sequence definitively ends
- recovery or work block clearly gives way to another episode

## 14.4 Replacement rule

Right-edge episodes should be treated as provisional by design.

That is not a bug.

It is the correct consequence of bounded processing windows.

---

## 15. Confidence Model

Episode confidence should combine:

- segmentation confidence
- classification confidence
- evidence density
- evidence diversity
- state support quality

## 15.1 High confidence example

- long coherent segment
- multiple consistent observations
- consistent state trajectory
- clean closure boundary

## 15.2 Low confidence example

- sparse short segment
- conflicting evidence
- uncertain kind assignment
- right-edge unresolved tail

## 15.3 Confidence semantics

As elsewhere:

- confidence is not intensity
- confidence is not importance
- confidence is quality of assembly and classification

---

## 16. Evidence Link Model

Every episode should link back to both observations and state estimates.

Suggested link shapes:

```text
Observation --episode_input--> Episode
StateEstimate --episode_input--> Episode
```

Where useful, link metadata should include:

- role
- weight
- polarity
- beat membership

Examples of roles:

- `primary_anchor`
- `supporting_context`
- `state_backdrop`
- `boundary_signal`
- `classification_evidence`

This makes episode assembly explainable and debuggable.

---

## 17. Rebuild And Replacement Policy

## 17.1 Rebuild trigger

Episode rebuild should trigger when:

- state estimation updates a window
- observation compaction updates a window
- late-arriving observations change local context
- episode pipeline version changes
- manual rebuild is requested

## 17.2 Replacement unit

Replacement should be bounded by:

- profile
- target window plus left lookback
- pipeline version

The pipeline should not surgically mutate one row in place from one new event.

## 17.3 Boundary overlap rule

Because episodes can cross the target window edge, rebuild should load:

- target window
- left lookback
- overlapping `active` episode if present

Historical rebuilds may optionally also use small right lookahead.

## 17.4 Downstream dirty windows

After episode rebuild finishes, emit dirty windows for:

- pattern inference
- report generation if needed later

Episode is the canonical upstream input to pattern layer.

---

## 18. What Episode Builder Must Not Do

Episode builder must not:

- compute long-range recurring patterns
- decide trait-level beliefs
- explain multi-week causal mechanisms
- generate coaching recommendations
- rewrite state estimates

If episode builder starts saying:

- "you always do this when uncertain"
- "this proves a defense mechanism"

then pattern or reflection logic has leaked downward.

---

## 19. Suggested Module Layout

Suggested future layout:

```text
packages/core/src/reflection/episode/
  build-episode-timeline.ts
  score-episode-boundaries.ts
  segment-episode-candidates.ts
  stitch-episode-sources.ts
  classify-episode-kind.ts
  build-episode-story-beats.ts
  resolve-episode-status.ts

apps/server/src/reflection/episode/
  run-episode-window.ts
  load-episode-input-window.ts
  write-episodes.ts
  schedule-episode-window.ts
```

Rule:

- `packages/core` owns pure transforms
- `apps/server` owns loading, persistence, scheduling, and rebuild coordination

---

## 20. Phase Plan

## Phase 1: Segmentation Framework

Goal:

- unified episode input timeline
- boundary scoring
- cluster formation
- active-tail handling

## Phase 2: V1 Episode Kinds

Goal:

- `deep_work_block`
- `shallow_drift_block`
- `meeting_load_block`
- `recovery_block`
- `decision_friction_block`
- `rumination_block`

## Phase 3: Evidence And Debuggability

Goal:

- story beat stabilization
- evidence link roles
- confidence and quality counters

## Phase 4: Richer Episode Semantics

Goal:

- better cross-source stitching
- more nuanced local narrative kinds
- possible model-assisted summarization later

---

## 21. Open Questions

These should remain explicit.

### 21.1 Generic fallback kind

Do we want an explicit persisted `mixed_context_block` kind, or should weak segments simply be discarded more often?

V1 recommendation:

- allow one generic fallback kind
- prefer that over forced misclassification

### 21.2 State dependence strength

Should some episode kinds require minimum state support?

Example:

- `deep_work_block` may be mostly observation-anchored
- `decision_friction_block` may need stronger uncertainty support

V1 recommendation:

- allow kind-specific thresholds
- keep observation anchor mandatory

### 21.3 Model assistance

Should story beat and summary generation stay deterministic only?

V1 recommendation:

- deterministic and template-based first
- consider model assistance only after evidence links and evaluation are stable

---

## 22. Summary

The episode layer should be the first narrative layer in the reflection system.

Its job is to transform observation and state windows into bounded, interpretable local narrative units.

The key decisions are:

- keep state, episode, and pattern boundaries strict
- make segmentation primary
- stitch across sources without losing factual anchors
- handle right-edge tails explicitly
- keep V1 episode kinds descriptive rather than mechanism-heavy
- link every episode back to observation and state evidence

That gives pattern inference and reflection reporting a stable narrative substrate instead of raw events or hidden heuristics.
