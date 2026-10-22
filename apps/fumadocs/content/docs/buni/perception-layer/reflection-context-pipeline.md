---
title: "Reflection Context Pipeline"
---

# Reflection Context Pipeline

> Status: Superseded by simplified reflection design
> Date: 2026-05-04
> Companion docs:
>
> - [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> - [./reflection-system-architecture.md](./reflection-system-architecture.md)
> - [./reflection-contracts-and-storage.md](./reflection-contracts-and-storage.md)
> - [./reflection-state-estimate-pipeline.md](./reflection-state-estimate-pipeline.md)
> - [./reflection-episode-pipeline.md](./reflection-episode-pipeline.md)
> - [./reflection-pattern-hypothesis-pipeline.md](./reflection-pattern-hypothesis-pipeline.md)
> - [./reflection-report-pipeline.md](./reflection-report-pipeline.md)
> - [./reflection-comparison-signal-projection.md](./reflection-comparison-signal-projection.md)

> Superseded Note:
> The active target reflection design removes the context snapshot layer.
> Use [./reflection-pipeline-simplification.md](./reflection-pipeline-simplification.md) for the current direction.

## 1. Purpose

This document defines the context-compression layer that converts reflection artifacts into a bounded runtime-facing snapshot.

It answers one question:

**what compressed reflection context should be available right now for runtime and coaching surfaces?**

This document defines:

- what `ReflectionContext` means
- where the boundary sits between reports, context, and runtime signals
- how reports, patterns, episodes, and state should be compressed
- how context snapshot lifecycle should work
- how `ReflectionSignal` should be projected from context
- how context should hand off into chat turn runtime

It does not define:

- report synthesis
- intervention plan generation
- provider prompt construction

---

## 2. Core Decision

`ReflectionContext` is a **compression layer**, not a new reasoning layer.

That means:

- it should not rediscover patterns
- it should not generate new report conclusions
- it should not behave like a hidden parallel cognition system

Its job is only to:

- compress the latest relevant reflective state
- preserve the minimum structure runtime and supervision need
- stay small, stable, and cheap to load

So the conceptual stack is:

```text
Episode / PatternHypothesis / ReflectionReport
  -> ReflectionContext
  -> ReflectionSignal projection
  -> TurnContext / coaching surfaces
```

The boundary is:

- `ReflectionReport` is a period artifact
- `ReflectionContext` is a current snapshot
- `ReflectionSignal` is an optional runtime projection derived from context

If context builder starts inventing new meaning, it has leaked downward into report or pattern logic.

If runtime starts loading full reports instead of context, the boundary has failed.

---

## 3. Boundary Definition

## 3.1 Input boundary

Context pipeline should consume:

- latest relevant `ReflectionReport`
- active or weakening `PatternHypothesis`
- recent high-salience `Episode`
- recent or current `StateEstimate`
- optional intervention effectiveness preferences

It should not use:

- raw observations directly
- full historical artifact graphs
- turn-time chat content as a primary input

## 3.2 Output boundary

Context pipeline should produce:

- durable `ReflectionContext`
- optional derived `ReflectionSignal[]`

`ReflectionContext` is the only reflection artifact that chat turn runtime should load directly.

## 3.3 Why context exists

Without context, runtime would need to choose between two bad options:

- load full reports and patterns, which is too large and unstable
- ignore reflection entirely, which wastes the longitudinal system

`ReflectionContext` is the middle layer that solves that.

---

## 4. ReflectionContext Contract Meaning

The current contract direction is correct:

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
```

Interpretation rules:

- `window` is the context relevance horizon, not necessarily the full report period
- `currentState` is the compressed near-present state backdrop
- `activePatterns` is the small set of patterns worth keeping live in context
- `recentEpisodes` is a bounded list of local narrative slices still relevant now
- `coachingNotes` are short context cues, not full reflective prose
- `interventionPreferences` are compressed preference hints, not plans
- `sourceReportIds` preserve provenance to the latest relevant reports

`ReflectionContext` should be durable and versioned, but disposable and rebuildable.

---

## 5. Why Context Is Not A Report

`ReflectionReport` is period-centric and expressive.

`ReflectionContext` is present-centric and compressed.

Report asks:

- what mattered in this day, week, or month

Context asks:

- what from that reflection still matters right now

Examples:

- a weekly report may contain five important findings
- context may only keep two active patterns, one recent episode, and two coaching notes

This distinction must remain strict.

---

## 6. Compression Inputs

## 6.1 Report inputs

Context should derive primarily from the latest relevant reports.

Recommended default sources:

- latest `daily` report
- latest `weekly` report
- optionally latest `monthly` report when it changes a long-horizon framing

## 6.2 Pattern inputs

Context should also load:

- `active` patterns
- strong `weakening` patterns if still relevant to present behavior

`retired` and `rejected` patterns should not usually enter live context.

## 6.3 Episode inputs

Context should load:

- recent `closed` episodes in a short recency horizon
- overlapping `active` episode if one exists

These provide local continuity for runtime and coaching.

## 6.4 State inputs

Context should load:

- latest strong `StateEstimate` windows near the present

This allows runtime to know things like:

- focus currently suppressed
- stress elevated
- recovery pressure high

without loading the full state timeline.

---

## 7. Context Window Model

## 7.1 Why context needs its own window

Context should not simply reuse:

- the report period window
- the episode rebuild window
- the state bucket window

It needs its own relevance horizon.

## 7.2 Recommended context horizon

V1 recommendation:

- context window should usually cover the recent 24 to 72 hours
- plus references back to longer-period reports through `sourceReportIds`

This gives runtime recent continuity without dragging in too much historical weight.

## 7.3 Long-horizon carryover

Some insights from weekly or monthly reports remain relevant even if they are older than the context horizon.

Those should appear as:

- coaching notes
- active pattern snapshots

not as full report text.

---

## 8. High-Level Pipeline

```text
Report / pattern / episode / state dirty window
  -> resolve latest relevant reports
  -> load active patterns
  -> load recent episodes
  -> load near-present state
  -> select context-worthy items
  -> compress into ReflectionContext fields
  -> assign snapshot status
  -> write ReflectionContext snapshot
  -> optionally project ReflectionSignal[]
```

This pipeline should remain explicit and deterministic-first.

---

## 9. Selection Before Compression

Like report building, context building should be selection-first.

The correct sequence is:

1. select current-relevant artifacts
2. rank by runtime usefulness
3. compress into bounded fields
4. optionally project runtime signals

If compression runs on everything indiscriminately, context will bloat and runtime quality will degrade.

## 9.1 Context-worthiness rule

An artifact is context-worthy only if it is likely to matter now.

Examples:

- active pattern with recent support
- today’s high-salience daily reflection note
- still-open decision-friction episode
- current high recovery pressure

Examples of non-context-worthy items:

- stale retired pattern with no present relevance
- full monthly summary prose
- low-salience historical episode

---

## 10. CurrentState Compression

## 10.1 Purpose

`currentState` should provide the minimum latent backdrop runtime may need.

It should not be a full state history.

## 10.2 Inclusion rule

Include a state dimension only if:

- it is recent enough
- confidence is high enough
- it is likely relevant to present interpretation

This is why the contract uses `Partial<Record<...>>`.

## 10.3 Compression rule

For each included dimension, preserve only:

- current value
- confidence
- one short summary

All lower-level evidence remains traceable in the state layer, not duplicated here.

---

## 11. ActivePatterns Compression

## 11.1 Purpose

`activePatterns` should expose the small set of recurring structures that remain behaviorally relevant now.

## 11.2 Inclusion rule

Include only patterns that are:

- `active`
- or strong `weakening` patterns with recent relevance

Recommended V1 cap:

- 2 to 5 patterns max

## 11.3 Compression fields

Each pattern snapshot should preserve:

- identity
- kind
- statement
- confidence
- `lastSeenAt`

That is enough for runtime and context-aware coaching surfaces.

---

## 12. RecentEpisodes Compression

## 12.1 Purpose

`recentEpisodes` should preserve short-horizon narrative continuity.

It answers:

- what local slice was happening recently
- what local slice might still be ongoing

## 12.2 Inclusion rule

Recommended V1 cap:

- 1 to 4 episodes max

Selection priority:

- active episode first
- then most recent high-salience closed episodes

## 12.3 Compression fields

Keep only:

- id
- kind
- summary
- end time

If more detail is needed later, runtime can still inspect linked sources through dedicated tools or future loaders, but not by default.

---

## 13. CoachingNotes Compression

## 13.1 Purpose

`coachingNotes` is where context stores short reflective cues that remain useful now.

Examples:

- "Late-day decision friction often turns into research-heavy drift."
- "Meeting-heavy mornings usually require explicit recovery protection."

## 13.2 Source rule

Coaching notes should be derived from:

- recent reports
- active patterns
- strong recent episodes

They should not be newly invented independent conclusions.

## 13.3 Note style

Notes should be:

- short
- neutral
- actionable-adjacent
- non-judgmental

Recommended V1 cap:

- 1 to 3 notes

---

## 14. InterventionPreferences Compression

## 14.1 Purpose

`interventionPreferences` captures what style of help currently seems to work or fit.

Examples:

- prefers gentle redirect
- responds better to low-friction prompts
- avoids frequent interruption

## 14.2 Source rule

Preferences may be derived from:

- report recommendations
- intervention outcome aggregates
- supervision learning later

In V1, this field may remain sparse.

## 14.3 Why preferences belong here

These preferences are not full supervision plans.

They are part of the live context for any downstream coaching or runtime decision surface.

---

## 15. Snapshot Status And Lifecycle

## 15.1 Snapshot status

The storage table already has a `status` field.

V1 should use at least:

- `active`
- `superseded`

Optionally later:

- `draft`
- `archived`

## 15.2 Status meaning

### `active`

This is the latest canonical context snapshot for the profile.

### `superseded`

This snapshot has been replaced by a newer one and should not be loaded by default.

## 15.3 Replacement rule

Context snapshots should be append-and-supersede, not mutate-in-place.

That means:

- write new snapshot
- mark older latest snapshot as superseded

This keeps context history inspectable without forcing runtime to choose among many candidates.

---

## 16. ReflectionSignal Projection

## 16.1 Core rule

`ReflectionSignal` is not the source of truth.

It is a runtime projection derived from `ReflectionContext`.

## 16.2 Why projection exists

Runtime may want a normalized signal surface instead of custom reflection-aware logic everywhere.

Projecting signals from context allows:

- bounded integration with `SignalSet`
- runtime heuristics to consume reflection hints in a familiar shape
- observability over which reflection hints are influencing runtime

## 16.3 Projection rules

Suggested mappings:

- active pattern with high confidence -> `pattern_activation`
- high current stress or recovery pressure -> `state_pressure`
- strong coaching note or preference cue -> `coaching_opportunity`

## 16.4 Projection limits

Projection should stay sparse.

Recommended V1 cap:

- 0 to 3 reflection signals

Not every context snapshot needs to emit signals.

---

## 17. Runtime Handoff

## 17.1 Loading rule

Chat turn runtime should:

- load the latest `active` context snapshot
- derive optional `ReflectionSignal[]`
- merge them into the larger turn context

It should not:

- load full reports
- scan pattern tables ad hoc during turn execution
- recalculate context synchronously in the turn path

## 17.2 TurnContext direction

The intended future shape remains:

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

This keeps runtime bounded and explicit.

## 17.3 Runtime usage rule

Runtime should treat reflection context as:

- context backdrop
- soft interpretive hint
- optional planning influence

It should not let reflection context dominate immediate user intent.

---

## 18. Supervision Handoff

## 18.1 Why context also matters for supervision

Supervision is not only report-driven.

It also needs a present-tense snapshot.

That is exactly what context provides.

## 18.2 Supervision inputs from context

Useful supervision inputs:

- active patterns
- current state pressure
- coaching notes
- intervention preferences

## 18.3 Boundary rule

Context may inform supervision.

It does not become supervision.

---

## 19. Rebuild And Replacement Policy

## 19.1 Rebuild trigger

Context rebuild should trigger when:

- a relevant report changes
- active patterns change
- recent episode set changes materially
- near-present state changes materially
- context pipeline version changes
- manual rebuild is requested

## 19.2 Replacement unit

Replacement should be bounded by:

- profile
- context horizon
- pipeline version

Do not patch one field in place because one upstream artifact changed.

## 19.3 Downstream uses

After context rebuild finishes, downstream consumers may include:

- chat turn runtime
- supervision planning
- lightweight dashboard surfaces

---

## 20. What Context Builder Must Not Do

Context builder must not:

- rediscover patterns
- write report-like prose
- prescribe interventions
- become a hidden second runtime planner
- overload `ReflectionSignal` with all reflection meaning

If context builder starts acting like a mini report writer or a mini supervisor, the boundary has collapsed.

---

## 21. Suggested Module Layout

Suggested future layout:

```text
packages/core/src/reflection/context/
  select-context-state.ts
  select-context-patterns.ts
  select-context-episodes.ts
  build-coaching-notes.ts
  build-intervention-preferences.ts
  project-reflection-signals.ts

apps/server/src/reflection/context/
  run-context-snapshot.ts
  load-context-inputs.ts
  write-context-snapshot.ts
  load-latest-context-snapshot.ts
```

Rule:

- `packages/core` owns pure compression and projection
- `apps/server` owns loading, persistence, scheduling, and runtime retrieval

---

## 22. Phase Plan

## Phase 1: Snapshot Compression Framework

Goal:

- define context horizon
- define field-level selection rules
- define snapshot lifecycle

## Phase 2: Runtime Projection

Goal:

- derive sparse `ReflectionSignal[]`
- wire future `TurnContext.reflectionContext`
- keep runtime load path cheap

## Phase 3: Supervision Support

Goal:

- stabilize coaching notes
- stabilize intervention preferences
- support supervision input without bloating runtime

---

## 23. Open Questions

These should remain explicit.

### 23.1 Context horizon tuning

Should the default horizon be:

- last 24 hours
- last 48 hours
- last 72 hours

V1 recommendation:

- start with 48 hours as the default compression horizon

### 23.2 Snapshot frequency

Should snapshots be:

- rebuilt only on upstream change
- periodically refreshed
- both

V1 recommendation:

- rebuild on material upstream change
- optionally refresh periodically for safety

### 23.3 Reflection signal integration

Should reflection signals become their own top-level bucket inside `SignalSet`, or stay derived and merged elsewhere?

V1 recommendation:

- keep them derived from context first
- avoid expanding `SignalSet` until runtime usage stabilizes

---

## 24. Summary

`ReflectionContext` should be the bounded present-tense compression layer of the reflection system.

Its job is to turn rich reflective artifacts into one small, stable snapshot that runtime and coaching surfaces can consume cheaply.

The key decisions are:

- keep context as compression, not new reasoning
- select before compressing
- derive signals from context, not the other way around
- keep full reports out of runtime
- let context support both runtime and supervision without becoming either

That gives the reflection system a clean bridge back into the turn runtime without collapsing the longitudinal architecture.
