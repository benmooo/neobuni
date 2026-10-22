---
title: "Perception Signal Adapters V1"
---

# Perception Signal Adapters V1

> Status: Active design
> Date: 2026-05-02
> Companion docs: [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md), [`../runtime-kernel-implementation-plan.md`](../runtime-kernel-implementation-plan.md), [`./reflection-system-architecture.md`](./reflection-system-architecture.md)

## 1. Purpose

This document defines the first real perception-layer implementation step for Buni.

The goal is not multimodal perception yet. The goal is to stop treating `SignalSet` as a mostly empty shell and turn it into a real normalization boundary.

V1 should give us:

- a stable contract between runtime shell and perception logic
- adapter-based signal generation instead of one monolithic heuristic file
- useful non-text signals from schedule, behavioral, and environmental context
- observability-ready signal outputs that can later be evaluated and tuned

## 2. Problem

Current state:

- `textSignals` have real content
- `memorySignals` have real content
- `scheduleSignals`, `behavioralSignals`, and `environmentalSignals` are empty arrays
- the server loader does not yet provide enough raw context for those adapters

This means the perception layer exists structurally, but not operationally.

## 3. Design Rule

Perception must follow the same architectural rule as the rest of the runtime:

- shell loads raw context
- adapters normalize raw context into signals
- kernel consumes normalized signals

Adapters must not depend directly on DB rows or route-specific payload shapes.

## 4. Target Shape

### 4.1 Raw signal context

`TurnContext` should carry a raw signal context block that is still close to runtime facts, but already detached from storage implementation details.

Suggested shape:

```ts
type SignalContext = {
  schedules: ScheduleSignalInput[];
  recentRuntimeTurns: RuntimeTurnSignalInput[];
  environment: {
    effectiveTimezone: string;
  };
};
```

### 4.2 Adapter pipeline

`buildSignalSet()` should become a composition point, not the place where every heuristic lives.

Suggested composition:

```ts
SignalSet = {
  textSignals: adaptTextSignals(...)
  memorySignals: adaptMemorySignals(...)
  scheduleSignals: adaptScheduleSignals(...)
  behavioralSignals: adaptBehavioralSignals(...)
  environmentalSignals: adaptEnvironmentalSignals(...)
}
```

## 5. V1 Adapter Inputs

### Text adapter

Input:

- latest user text
- recent user texts

Output:

- support request
- reflection request
- planning request
- warmth
- distress
- explicit memory reference
- topic continuity

This is mostly the current implementation, moved behind an adapter boundary.

### Memory adapter

Input:

- latest user text
- unresolved memory slices
- recent memory slices

Output:

- unresolved overlap
- recent overlap

This is also mostly existing behavior, but moved behind its own adapter boundary.

### Schedule adapter

Input:

- active schedules
- current time

Output:

- `upcoming_commitment`
- `time_pressure`
- `missed_commitment`
- `schedule_disruption`

V1 heuristics:

- upcoming within 24 hours => upcoming commitment
- upcoming within 3 hours => time pressure
- overdue while still active => missed commitment
- multiple imminent or overdue items => schedule disruption

### Behavioral adapter

Input:

- latest user text
- recent user texts
- recent runtime turns

Output:

- `negative_trend`
- `withdrawal_pattern`
- `initiative_drop`

V1 heuristics:

- repeated distress-heavy turns => negative trend
- short retreating replies after negative turns => withdrawal pattern
- current reply much lower-energy than recent baseline => initiative drop

`routine_shift` is intentionally left for a later phase because V1 does not yet have reliable routine baselines.

### Environmental adapter

Input:

- effective timezone
- current time

Output:

- `time_context`

V1 heuristics:

- always emit one `time_context` signal with metadata
- score is higher during quiet hours / off-hours
- metadata includes local hour, day-of-week, weekend, and coarse day-part

`location_context`, `device_context`, and `ambient_context` remain future adapters.

## 6. V1 Contract Decisions

### Keep raw context small

Do not dump full schedules or runtime records into `TurnContext`.

Only pass the fields needed by adapters:

- schedule id / triggerAt / status / timezone / title / type
- runtime turn id / status / protective level / primary stance / recall strategy / tool count / startedAt

### Keep signal metadata explicit

Each adapter should attach enough metadata for inspection and tuning, for example:

- schedule adapter: nearest deadline, overdue count
- behavioral adapter: negative ratio, baseline length delta
- environmental adapter: local hour, day part

### Prefer sparse over noisy

Signals should be emitted when they carry planning value, not merely because a source exists.

Exception:

- `time_context` may always emit because it is cheap, bounded, and useful for later expression compilers

## 6.1 Quality Tuning Rules

V1.1 adds a quality layer on top of raw adapter output.

Every emitted signal should carry:

- `strengthBand`: `weak | medium | strong`
- `consumptionMode`: `observe | context_hint | decision_input`

These are derived from a central perception policy, not hardcoded ad hoc by each consumer.

### Consumption rule

- `observe`: keep for observability only; do not let this signal steer planning by itself
- `context_hint`: allowed to shape context interpretation, but should not dominate decisions alone
- `decision_input`: strong enough to be consumed by future soul / working-memory policy

Special rule:

- `time_context` remains `context_hint` at most in V1. It should not escalate protective or planning behavior on its own.

### Observability rule

`signal_normalization` spans should expose:

- total signal count
- weak / medium / strong counts
- observe / context hint / decision input counts
- top signals by score

This creates the first systematic quality surface for perception tuning.

## 7. File Layout

Suggested V1 layout:

```text
packages/core/src/perception/
  text-signal-adapter.ts
  memory-signal-adapter.ts
  schedule-signal-adapter.ts
  behavioral-signal-adapter.ts
  environmental-signal-adapter.ts
  index.ts
```

Runtime composition remains in:

```text
packages/core/src/runtime/build-signal-set.ts
```

Server shell responsibilities remain in:

```text
apps/server/src/runtime/load-turn-context.ts
```

## 8. What V1 Does Not Solve

V1 does not yet:

- continuous multi-source perception
- longitudinal observation storage
- episode or narrative construction
- periodic reflection reports
- supervision and intervention loops

Those are covered by the next-layer design in [`reflection-system-architecture.md`](./reflection-system-architecture.md).

- adapt device signals
- adapt ambient or sensor context
- infer strong behavioral baselines across long time windows
- feed these new signals deeply into soul and working-memory policy
- evaluate signal quality automatically

Those are later steps.

## 9. Done When

V1 is done when:

1. `TurnContext` includes raw signal context for schedules, recent runtime turns, and effective timezone
2. `buildSignalSet()` is a composition of dedicated adapters
3. `scheduleSignals`, `behavioralSignals`, and `environmentalSignals` are no longer always empty
4. runtime spans show non-zero signal counts in realistic turns
5. the implementation remains pure in `packages/core` and imperative in `apps/server`
