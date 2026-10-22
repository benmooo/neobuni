---
title: "Reflection State Estimate Pipeline"
---

# Reflection State Estimate Pipeline

> Status: Superseded by simplified reflection design
> Date: 2026-05-04
> Companion docs:
>
> - [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> - [./reflection-system-architecture.md](./reflection-system-architecture.md)
> - [./reflection-contracts-and-storage.md](./reflection-contracts-and-storage.md)
> - [./reflection-observation-ingestion-pipeline.md](./reflection-observation-ingestion-pipeline.md)
> - [./reflection-episode-pipeline.md](./reflection-episode-pipeline.md)
> - [./reflection-pattern-hypothesis-pipeline.md](./reflection-pattern-hypothesis-pipeline.md)
> - [./reflection-report-pipeline.md](./reflection-report-pipeline.md)
> - [./reflection-context-pipeline.md](./reflection-context-pipeline.md)

> Superseded Note:
> The active target reflection design removes the state-estimate layer.
> Use [./reflection-pipeline-simplification.md](./reflection-pipeline-simplification.md) for the current direction.

## 1. Purpose

This document defines the state-estimation layer that sits between observation ingestion and episode building.

It exists to answer one question:

**given the observations in a bounded time window, what was the likely internal state?**

This document defines:

- what `StateEstimate` means
- where the boundary sits between observation, state, and episode
- which state dimensions should exist
- how state windows should be estimated
- how smoothing, baseline, and confidence should work
- how state output should hand off into episode building

It does not define:

- episode segmentation
- narrative interpretation
- pattern inference
- reflection report generation

---

## 2. Core Decision

`Episode` should not do hidden state inference.

If episode semantics depend on latent state, then the system needs an explicit `StateEstimate` layer first.

So the conceptual stack is:

```text
Observation
  -> StateEstimate
  -> Episode
```

The boundary is:

- `Observation` answers: what happened
- `StateEstimate` answers: what state the user was likely in
- `Episode` answers: what narrative unit those facts and states formed

This is the most important decision in the state pipeline.

It prevents:

- episode heuristics from silently duplicating state logic
- pattern inference from depending on hidden assumptions
- later refactors from untangling mixed observation/state/episode code

---

## 3. Boundary Definition

## 3.1 Observation boundary

Observation remains factual and source-grounded.

Examples:

- one git commit
- one journal entry
- one browser session
- one app-usage block
- one sleep interval

Observation may contain emotional or semantic content if the source itself carries it.

But observation still does not say:

- "focus was low"
- "uncertainty was high"
- "social bandwidth was depleted"

Those belong to state estimation.

## 3.2 State boundary

State estimation is:

- latent
- bounded in time
- dimension-specific
- confidence-bearing
- evidence-linked

State estimation should produce claims like:

- stress elevated from 14:30 to 15:15
- focus suppressed between 16:00 and 17:00
- uncertainty rising across the pre-decision window

State estimation should not produce claims like:

- avoidance loop
- doomscrolling episode
- meeting overload day

Those belong to `Episode`.

## 3.3 Episode boundary

Episode is where the system begins narrative composition.

Episode may depend on:

- `Observation`
- `StateEstimate`

But episode should consume those inputs, not recreate them.

---

## 4. StateEstimate Contract Meaning

The existing contract direction is correct:

```ts
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
```

Interpretation rules:

- `value` is normalized to a bounded scalar, ideally `0..1`
- `baseline` is the user-relative expected value for that dimension in a comparable context
- `direction` is relative to nearby windows or baseline, not absolute morality
- `summary` is a bounded explanation, not a narrative diagnosis
- `confidence` expresses estimation quality, not emotional severity
- `details` holds evidence metadata, contributors, and internal scoring traces

The storage design of one dimension per row should remain.

That keeps dimensions extensible and episode inputs simple.

---

## 5. State Dimensions

## 5.1 Design rule

State dimensions should satisfy three conditions:

1. they are inferable from observation evidence
2. they are useful for later episode and pattern reasoning
3. they are not already narrative concepts

## 5.2 Canonical dimension set

The current dimension set is a good V1 base:

- `energy`
- `stress`
- `focus`
- `uncertainty`
- `social_load`
- `emotional_volatility`
- `recovery_pressure`

## 5.3 Dimension meanings

### `energy`

Meaning:

- estimated cognitive and physical available capacity

Evidence examples:

- sleep observations
- movement
- prolonged work duration
- late-night activity

### `stress`

Meaning:

- estimated internal pressure or activation load

Evidence examples:

- stress language in notes
- rapid switching behavior
- compressed deadlines
- physiological stress markers when available

### `focus`

Meaning:

- estimated ability to sustain directed attention

Evidence examples:

- uninterrupted work output
- app-switching rate
- browser fragmentation
- task continuity

### `uncertainty`

Meaning:

- estimated indecision, ambiguity pressure, or lack of commitment confidence

Evidence examples:

- journal language about doubt
- research-heavy behavior without execution
- repeated revisiting of decision material
- stalled project output

### `social_load`

Meaning:

- estimated social or interpersonal demand accumulated in a window

Evidence examples:

- meeting density
- social calendar load
- conversation intensity
- travel and coordination context

### `emotional_volatility`

Meaning:

- estimated instability or rapid movement in emotional tone

Evidence examples:

- frequent mood-tag changes
- conflicting text sentiment
- abrupt valence shifts in notes

### `recovery_pressure`

Meaning:

- estimated need for rest, decompression, or regulation

Evidence examples:

- sleep debt
- long sedentary or work-heavy windows
- stress plus low-energy co-occurrence
- repeated fatigue markers

## 5.4 V1 implementation scope

Design all dimensions now, but implement only a small subset first.

Recommended first dimensions:

- `energy`
- `stress`
- `focus`
- `uncertainty`

These are enough to support the first useful episode kinds without spreading the system too thin.

---

## 6. Input Model

## 6.1 Required input

The state pipeline should depend on canonical `Observation` rows.

Required input:

- `Observation[]` in target window
- source-family-specific lookback observations

## 6.2 Optional supporting input

State estimation may also use:

- previous nearby `StateEstimate` rows for smoothing
- recent schedule context already represented as observations when available
- profile timezone and day-part context

Important:

- the state pipeline should not depend on episode output
- it should not depend on report output

## 6.3 Evidence rule

Every `StateEstimate` should be traceable to supporting observations through `reflection_links`.

That means the state layer must keep an explicit evidence set, not only a scalar score.

---

## 7. Window Model

## 7.1 Why windowing matters

State is not a point event.

It is also not a full-day blob.

So the system needs a bounded window model that is:

- stable enough for reasoning
- fine-grained enough to show transitions
- coarse enough to avoid noise

## 7.2 Two-level model

The recommended design is:

1. estimate on fixed internal buckets
2. surface merged windows as stored `StateEstimate` rows

Internal buckets are computational.

Stored state windows are explanatory.

## 7.3 Internal bucket size

Recommended V1 bucket sizes:

- default: 15 minutes
- minimum: 5 minutes for very dense sources later
- maximum: 30 minutes for sparse sources

V1 should standardize on 15-minute buckets unless a source family clearly needs otherwise.

## 7.4 Surfaced state window

After bucket-level scoring and smoothing, adjacent buckets with similar direction and value band should be merged into a larger state window.

Examples:

- 14:00-14:15 `stress=0.73`
- 14:15-14:30 `stress=0.78`
- 14:30-14:45 `stress=0.75`

becomes:

- 14:00-14:45 elevated stress window

This keeps storage and later episode reasoning simpler.

## 7.5 Window rebuild unit

State estimation should rebuild by time window, not by row.

Suggested rebuild input:

- target window
- state-stage lookback padding
- target dimensions
- pipeline version

This should match the overall reflection rebuild philosophy.

---

## 8. Estimation Pipeline

The state pipeline should follow a small explicit sequence.

```text
Observation dirty window
  -> load observations + lookback
  -> derive dimension evidence points
  -> score bucket states
  -> compare to baseline
  -> smooth nearby buckets
  -> merge into surfaced state windows
  -> write StateEstimate rows
  -> write evidence links
  -> emit episode dirty windows
```

## 8.1 Derive dimension evidence points

Each dimension should map observations into evidence contributions.

Examples:

- browser fragmentation contributes negatively to `focus`
- sustained coding observation contributes positively to `focus`
- distress-heavy journal entry contributes to `stress`
- sleep deficit contributes to `energy` down and `recovery_pressure` up

This stage is still not yet the final state.

It only produces evidence signals for each dimension.

## 8.2 Score bucket states

For each bucket and dimension:

- collect overlapping evidence points
- apply source-specific weights
- compute a provisional scalar `value`
- compute provisional confidence

This step should remain purely computational and deterministic in V1.

## 8.3 Compare to baseline

The raw bucket score is not enough.

The system should compare the bucket value to a user-relative baseline where available.

Without baseline, "0.6 focus" means very little.

With baseline, the system can say:

- lower than usual for this user
- higher than usual for this time of day

## 8.4 Smooth bucket sequence

State should not flicker wildly because one observation arrived near a boundary.

Apply smoothing across nearby buckets to reduce noise while preserving real transitions.

V1 smoothing should be simple:

- neighbor-aware weighted averaging
- short-gap bridging
- minimum duration threshold before surfacing a transition

## 8.5 Merge into surfaced windows

After smoothing, merge adjacent buckets when:

- value band is similar
- direction is compatible
- there is no strong contradictory evidence

This creates the stored `StateEstimate` rows.

---

## 9. Baseline Model

## 9.1 Why baseline is required

State estimation should be personal, not generic.

Examples:

- one user's normal focus rhythm may be low in the morning and high at night
- one user's normal social load may be much higher than another's

So baseline should exist from the beginning, even if it is simple.

## 9.2 V1 baseline shape

V1 should use a lightweight rolling baseline, not a separate major artifact family.

Recommended baseline reference:

- same user
- same dimension
- recent trailing history
- optionally same day-part

`baseline` can remain a scalar on the `StateEstimate` row.

The details of how it was computed can live in `details`.

## 9.3 Baseline maturity

Not all profiles will have enough history.

So baseline usage should support three modes:

- `mature`: enough history, baseline trusted
- `partial`: some history, baseline weakly trusted
- `cold_start`: too little history, baseline absent

This maturity should affect confidence.

---

## 10. Confidence Model

State confidence should not be guessed informally.

It should be derived from explicit quality factors.

## 10.1 Confidence factors

Recommended factors:

- evidence coverage
- evidence diversity
- evidence consistency
- baseline maturity
- data freshness

## 10.2 Confidence examples

High confidence:

- multiple agreeing sources
- mature baseline
- dense overlapping evidence

Low confidence:

- one sparse observation
- conflicting evidence
- weak baseline
- long interpolated gap

## 10.3 Confidence semantics

Important:

- confidence is not severity
- confidence is not moral certainty
- confidence only expresses quality of inference

---

## 11. Direction Model

`direction` should stay narrow and operational:

- `up`
- `down`
- `flat`
- `null` when insufficient basis exists

Interpretation:

- direction is relative movement in the dimension
- it is not "good" or "bad"

Examples:

- `stress up`
- `focus down`
- `energy flat`

This is enough for episode and pattern builders.

We do not need more semantic labels here.

---

## 12. Evidence Link Model

Every state estimate should link back to supporting observations.

Suggested link shape:

```text
Observation --state_input--> StateEstimate
```

Where useful, the link metadata should include:

- contribution weight
- contribution polarity
- contribution kind

Examples:

- browser fragmentation -> focus down
- deep work block observation -> focus up
- distress journal entry -> stress up

This keeps state explainable and debuggable.

---

## 13. Rebuild And Replacement Policy

## 13.1 Rebuild trigger

State rebuild should trigger when:

- observation compaction updated a window
- late observations arrive
- baseline logic changes
- state pipeline version changes
- manual rebuild is requested

## 13.2 Replacement unit

Replacement should be bounded by:

- profile
- dimension
- target window
- pipeline version

Do not try to mutate individual state rows in place based on one new event.

## 13.3 Dirty windows downstream

After state rebuild finishes, emit dirty windows for episode building.

Episode should consume:

- observations in target window
- state estimates in target window

This keeps episode orchestration explicit.

---

## 14. What State Estimation Must Not Do

The state layer must not collapse into early episode logic.

It must not:

- label avoidance
- label rumination
- label deep work
- generate daily summaries
- infer long-range causal stories

Those all belong later.

If the state layer starts naming narrative patterns, the boundary is broken.

---

## 15. Suggested Module Layout

Suggested future layout:

```text
packages/core/src/reflection/state/
  derive-dimension-evidence.ts
  score-state-buckets.ts
  compute-state-baseline.ts
  smooth-state-buckets.ts
  merge-state-windows.ts

apps/server/src/reflection/state/
  run-state-window.ts
  load-state-input-window.ts
  write-state-estimates.ts
  schedule-state-window.ts
```

Rule:

- `packages/core` owns pure transforms
- `apps/server` owns loading, persistence, scheduling, and rebuild coordination

---

## 16. Phase Plan

## Phase 1: Core Dimension Framework

Goal:

- finalize state dimension taxonomy
- finalize bucket and surfaced-window model
- finalize baseline and confidence rules

## Phase 2: First Implemented Dimensions

Goal:

- implement `energy`
- implement `stress`
- implement `focus`
- implement `uncertainty`

## Phase 3: Evidence And Debuggability

Goal:

- evidence links for all state rows
- details payload shape stabilization
- quality counters and observability

## Phase 4: Expanded Dimensions

Goal:

- implement `social_load`
- implement `emotional_volatility`
- implement `recovery_pressure`

---

## 17. Open Questions

These should remain explicit.

### 17.1 Separate baseline storage

Do we eventually want a dedicated baseline artifact or table?

V1 recommendation:

- no
- keep baseline lightweight and embedded in state output details

### 17.2 Cross-dimension coupling

Should dimensions influence each other directly?

Example:

- low energy raises recovery pressure
- high uncertainty lowers focus

V1 recommendation:

- allow shared evidence
- avoid direct recursive dimension-to-dimension feedback at first

### 17.3 Model assistance

Should state estimation stay deterministic only, or allow lightweight model assistance later?

V1 recommendation:

- deterministic first
- model assistance only after we have good evidence traces and evaluation surfaces

---

## 18. Summary

The state-estimation layer should be the explicit latent layer between observation and episode.

Its job is to convert structured facts into bounded, dimension-specific, confidence-bearing internal-state estimates.

The key decisions are:

- keep the observation/state/episode boundary strict
- estimate on fixed buckets, store merged windows
- use personal baseline from the beginning
- keep confidence explicit
- link every state row back to observation evidence

That gives the later episode pipeline a clean, non-ambiguous substrate to build on.
