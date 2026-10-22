---
title: "Reflection Comparison Signal Projection"
---

# Reflection Comparison Signal Projection

> Status: Superseded by simplified reflection design
> Date: 2026-05-04
> Companion docs:
> - [./reflection-report-pipeline.md](./reflection-report-pipeline.md)
> - [./reflection-context-pipeline.md](./reflection-context-pipeline.md)
> - [../../ARCHITECTURE.md](../../ARCHITECTURE.md)

> Superseded Note:
> This note assumes the older report -> context -> runtime projection design.
> The active target reflection architecture removes the context snapshot layer and is documented in [./reflection-pipeline-simplification.md](./reflection-pipeline-simplification.md).

## Purpose

This note explains how prior-period comparison should influence `ReflectionSignal` and runtime context without collapsing report logic into runtime heuristics.

It answers one question:

**how should change across periods become a small, runtime-usable signal?**

## Core rule

Comparison stays owned by the report layer.

- `PatternHypothesis` decides what recurring structure exists.
- `ReflectionReport` decides whether that structure is strengthening, weakening, stabilizing, retiring, or newly emerging in the current period.
- `ReflectionContext` and `ReflectionSignal` only compress that already-derived change into runtime-usable guidance.

So context and signal projection may amplify or prioritize change that is already present in reports.

They must not infer new trend directions from scratch.

## V1 projection rule

V1 should project comparison into runtime in two stages:

1. `ReflectionReport`
   Comparison changes report ranking, meta-cognition, recommendation phrasing, and summary.
2. `ReflectionContext`
   The latest reports compress into `coachingNotes`, `interventionPreferences`, and `ReflectionSignal` so runtime can load one bounded snapshot instead of full report history.

## Signal intent

Comparison-aware signal projection is meant to do three things:

- increase runtime salience when a costly negative pattern is strengthening
- preserve continuity when a positive pattern is stabilizing
- surface a coaching opportunity when a loop is weakening or retiring and should be protected

It is not meant to:

- replace report text with opaque scores
- inject full report history into the runtime kernel
- create a second pattern engine inside runtime

## Practical mapping

Useful V1 mappings:

- negative pattern strengthening or new emergence
  Bias toward stronger `pattern_activation` or `coaching_opportunity`
- negative pattern weakening or retiring
  Keep a coaching opportunity alive, but lower raw activation urgency
- positive pattern stabilizing
  Prefer continuity-oriented notes and lower-pressure recommendations
- monthly comparison with clear long-horizon change
  Favor `coaching_opportunity` over raw activation, because the meaning is usually strategic rather than immediate

For runtime use, `pattern_activation` should carry explicit semantic metadata instead of forcing downstream code to infer meaning from the pattern family name alone.

Suggested V1 metadata:

- `patternKind`
- `valence`: `positive | negative | neutral`
- `trajectory`: `new | strengthening | stable | weakening | retiring`

This lets runtime distinguish:

- negative activation that should raise protective salience
- positive activation that should reinforce continuity
- neutral activation that should stay reflective rather than urgent
- weakening versus strengthening so the same negative pattern does not always produce the same urgency

## Runtime boundary

There are two runtime integration surfaces:

1. `ReflectionSignal`
   Lightweight scores for bounded runtime decisions
2. `ReflectionContext`
   Small structured snapshot containing current state, active patterns, coaching notes, and intervention preferences

V1 runtime integration should prefer loading the latest `ReflectionContext` into `TurnContext`.

That gives runtime enough reflective continuity without forcing a hard merge between `ReflectionSignal` and the runtime `SignalSet` schemas.

## Current repo direction

Current implementation direction in this repo is:

- comparison is computed in the report layer
- context consumes the latest report outputs
- runtime loads the latest active `ReflectionContext`
- runtime projects `ReflectionSignal[]` from that context and adapts them into the runtime `SignalSet` through an explicit adapter layer
- `pattern_activation` now carries explicit `valence` and `trajectory` metadata so runtime can separate risky pattern activation from strength activation and distinguish strengthening pressure from weakening residue
- working memory uses reflection notes, active patterns, and intervention preferences as bounded context

A later step may deepen that adapter, but it should remain an explicit bridge rather than an implicit schema merge.
