---
title: "Reflection Pattern Hypothesis Pipeline"
---

# Reflection Pattern Hypothesis Pipeline

> Status: Superseded by simplified reflection design
> Date: 2026-05-04
> Companion docs:
> - [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> - [./reflection-system-architecture.md](./reflection-system-architecture.md)
> - [./reflection-contracts-and-storage.md](./reflection-contracts-and-storage.md)
> - [./reflection-observation-ingestion-pipeline.md](./reflection-observation-ingestion-pipeline.md)
> - [./reflection-state-estimate-pipeline.md](./reflection-state-estimate-pipeline.md)
> - [./reflection-episode-pipeline.md](./reflection-episode-pipeline.md)
> - [./reflection-report-pipeline.md](./reflection-report-pipeline.md)
> - [./reflection-context-pipeline.md](./reflection-context-pipeline.md)

> Superseded Note:
> The active target reflection design removes the pattern-hypothesis layer.
> Use [./reflection-pipeline-simplification.md](./reflection-pipeline-simplification.md) for the current direction.

## 1. Purpose

This document defines the pattern-hypothesis layer that sits between episode building and reflection reporting.

It answers one question:

**across multiple episodes, what repeated structure or candidate mechanism seems to be emerging?**

This document defines:

- what `PatternHypothesis` means
- where the boundary sits between episode, pattern, and reflection
- how repeated episode structures should be aggregated
- how trigger, mechanism, and counterevidence should be modeled
- how pattern confidence and lifecycle should work
- how pattern output should hand off into reports and supervision

It does not define:

- daily or weekly report writing
- intervention selection
- action delivery

---

## 2. Core Decision

Pattern hypothesis is the first **cross-episode meaning layer**.

That means:

- it may aggregate evidence across many episodes and days
- it may infer candidate trigger structure
- it may infer candidate mechanism language
- it may track whether a pattern is strengthening or weakening

But it must remain a hypothesis layer, not a final truth layer.

So the conceptual stack is:

```text
Observation
  -> StateEstimate
  -> Episode
  -> PatternHypothesis
  -> ReflectionReport
```

The boundary is:

- `Episode` explains one local narrative slice
- `PatternHypothesis` explains recurring structure across episodes
- `ReflectionReport` decides which patterns matter now and how to articulate them in a period narrative

If pattern builder starts writing reflective conclusions like:

- "this week your main issue was avoidance"
- "you should try a different coping strategy"

then it has leaked upward into reporting or supervision.

---

## 3. Boundary Definition

## 3.1 Input boundary

Pattern pipeline consumes:

- `Episode`
- supporting `Observation` and `StateEstimate` only through episode evidence or lookups when needed
- optional intervention outcome summaries later

It does not consume:

- reflection reports as a reasoning prerequisite
- downstream supervision actions as a primary input

## 3.2 Output boundary

Pattern pipeline produces:

- `PatternHypothesis`
- supporting evidence links
- downstream dirty windows for reflection reports
- later, optional supervision input material

## 3.3 What pattern is allowed to say

Pattern is allowed to say things like:

- when uncertainty rises, research-heavy decision-friction blocks tend to replace execution
- meeting-load blocks often precede recovery or low-focus blocks
- sleep debt days correlate with shallow-drift episodes later in the day

Pattern is not allowed to say things like:

- this is your core personality
- this is definitely the true cause
- this is the one thing you need to change

Those belong to reflection and supervision, and even there should be stated cautiously.

## 3.4 Causal humility rule

V1 pattern output should prefer language such as:

- repeated association
- likely trigger
- candidate mechanism
- plausible coping pattern

It should avoid:

- certainty language
- trait essentialism
- moral interpretation

---

## 4. PatternHypothesis Contract Meaning

The current contract direction is correct:

```ts
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
```

Interpretation rules:

- `kind` is the recurring pattern family
- `statement` is the top-level pattern description
- `triggerDescription` explains what tends to precede the pattern
- `mechanismDescription` explains the candidate local mechanism
- `counterevidenceDescription` explains where the pattern does not fit
- `activeWindow` is when the pattern is currently supported by evidence
- `confidence` is the quality of the hypothesis, not its severity
- `metrics` holds recurrence, trend, support, contradiction, and outcome data

`PatternHypothesis` should remain durable and queryable.

It is not only a generated sentence.

---

## 5. Pattern Lifecycle

## 5.1 Status model

The current status model is the right one:

- `candidate`
- `active`
- `weakening`
- `retired`
- `rejected`

## 5.2 Status meaning

### `candidate`

Meaning:

- there is some recurring evidence, but not enough stability yet

Typical reasons:

- low sample size
- recent emergence
- weak trigger alignment
- too much contradictory evidence

### `active`

Meaning:

- the pattern currently has enough repeated support to be surfaced as a live hypothesis

### `weakening`

Meaning:

- the pattern used to be active, but recent evidence is less supportive

This is useful because behavior change often matters as much as behavior repetition.

### `retired`

Meaning:

- the pattern no longer appears to be active in the recent horizon
- it remains historically true enough to preserve as past structure

### `rejected`

Meaning:

- the previous candidate explanation no longer fits the evidence well enough

This should be rare and explicit.

It is better than silently overwriting history.

## 5.3 Canonical rule

Canonical surfaced patterns are usually:

- `active`
- `weakening`
- sometimes `retired` for longitudinal review

`candidate` and `rejected` are mostly pipeline or debugging artifacts unless explicitly surfaced in expert views.

---

## 6. Inputs

## 6.1 Required inputs

Pattern pipeline should require:

- closed episodes in target horizon

V1 recommendation:

- do not build persistent pattern hypotheses from `active` episodes alone
- active episodes may inform candidate generation, but should not dominate stable pattern output

## 6.2 Supporting inputs

Pattern pipeline may also use:

- state distribution summaries per episode
- temporal context such as day-part and weekday
- outcome summaries where interventions already exist
- prior versions of matching patterns

## 6.3 Why episode is the canonical upstream

Pattern inference should not reason directly from raw observations when episode exists.

Episode is already the first narrative compression layer.

If pattern builder drops back to raw events as the main substrate, the layering has failed.

---

## 7. Pattern Build Unit

## 7.1 Rebuild unit

Pattern should rebuild by horizon window, not by single episode append.

Suggested rebuild input:

- target horizon window
- historical lookback horizon
- pattern families to evaluate
- pipeline version

## 7.2 Typical horizons

Recommended V1 horizons:

- rolling 7-day horizon for near-term active patterns
- rolling 28-day horizon for stronger recurrence
- explicit custom horizon for backfill or repair

## 7.3 Why horizon rebuild

Patterns depend on:

- recurrence count
- spacing between episodes
- recentness
- contradiction
- direction of change

Those are horizon properties, not single-row properties.

So the correct primitive is horizon rebuild.

---

## 8. High-Level Pipeline

```text
Episode dirty window
  -> load closed episodes in target horizon
  -> group episodes into candidate pattern families
  -> score recurrence and trigger structure
  -> evaluate counterevidence
  -> compare with prior pattern instances
  -> assign lifecycle status
  -> build statement / trigger / mechanism text
  -> write PatternHypothesis rows
  -> write evidence links
  -> emit report dirty windows
```

This should remain a small explicit pipeline.

---

## 9. Pattern Family Model

## 9.1 Why families are required

Pattern inference should not start from arbitrary sentence generation.

It should start from structured families that define what repeated structure to look for.

Family examples:

- uncertainty -> decision friction
- meeting load -> low focus or recovery need
- sleep debt -> shallow drift
- emotional volatility -> rumination

## 9.2 Family definition shape

Suggested internal shape:

```ts
type PatternFamily = {
  kind: string;
  episodeSelectors: string[];
  stateSelectors: string[];
  triggerRules: string[];
  contradictionRules: string[];
  minimumSupport: number;
};
```

This does not need to be a public contract yet.

But the pipeline should reason as if these families exist explicitly.

## 9.3 Family types

V1 should support three broad family types:

- recurrence families
- trigger-response families
- condition-outcome families

### Recurrence family

Asks:

- does the same kind of episode recur often enough to matter?

Example:

- repeated `shallow_drift_block`

### Trigger-response family

Asks:

- does one episode or state context tend to precede another?

Example:

- `decision_friction_block` followed by `shallow_drift_block`

### Condition-outcome family

Asks:

- does one background condition tend to correlate with a later local episode type?

Example:

- low energy and recovery pressure preceding low-focus work periods

---

## 10. Candidate Generation

## 10.1 Generate from episode clusters

Pattern candidates should be generated from recurring episode structures, not free-form language prompts.

Generation inputs may include:

- repeated episode kind
- repeated sequence of kinds
- repeated state backdrop
- repeated trigger context

## 10.2 Minimum support threshold

Candidates should not surface from one or two weak examples.

V1 should require:

- minimum recurrence count
- minimum evidence diversity
- minimum recency relevance

Exact numbers can be tuned later, but the concept should be explicit now.

## 10.3 Sequence awareness

Pattern candidates should consider order, not only frequency.

Example:

- uncertainty-driven decision friction before drift

is meaningfully different from:

- drift before decision friction

Temporal ordering is part of the pattern.

---

## 11. Trigger And Mechanism Inference

## 11.1 Trigger is not cause

`triggerDescription` should describe repeated preceding conditions, not guaranteed causal truth.

Good trigger phrasing:

- "decision ambiguity tends to precede these blocks"
- "meeting-heavy mornings often come before them"

Bad trigger phrasing:

- "meetings cause this"

## 11.2 Mechanism is candidate explanatory language

`mechanismDescription` is allowed to move beyond pure frequency, but it must remain modest.

Good mechanism phrasing:

- "passive information intake may be replacing a difficult commitment step"
- "social load may be reducing later willingness to initiate focused work"

This is stronger than episode language, but still below report-level meta-cognition.

## 11.3 Trigger extraction sources

Trigger inference may use:

- state backdrop preceding episode clusters
- recurring predecessor episode kinds
- repeated time-of-day or context features
- recurring observation tags already embedded in episodes

---

## 12. Counterevidence Model

Counterevidence is required.

Without it, pattern inference will overfit quickly.

## 12.1 What counts as counterevidence

Examples:

- many similar trigger conditions without the expected downstream episode
- recent episodes that contradict the older relationship
- intervention success that breaks the previous sequence
- strong positive work blocks under the same supposed trigger

## 12.2 Counterevidence usage

Counterevidence should affect:

- confidence
- status transition
- `counterevidenceDescription`

It should not be hidden just because the pattern is convenient.

## 12.3 Why explicit counterevidence matters

This system should be able to say:

- "this association used to be strong, but recent weeks contain several exceptions"

That is much more honest than presenting static pattern claims.

---

## 13. Confidence Model

Pattern confidence should combine:

- support count
- support diversity
- recency
- temporal consistency
- trigger clarity
- counterevidence weight

## 13.1 High confidence example

- repeated support across many days
- clear temporal ordering
- multiple supporting episode sequences
- limited contradiction

## 13.2 Low confidence example

- few examples
- weak or inconsistent triggers
- many contradictions
- old or stale support

## 13.3 Confidence semantics

As elsewhere:

- confidence is not importance
- confidence is not emotional intensity
- confidence is quality of recurring-hypothesis fit

---

## 14. Metrics Model

`metrics` should hold the structured support for the hypothesis.

Recommended metric fields:

- `supportCount`
- `contradictionCount`
- `recentSupportCount`
- `recentContradictionCount`
- `recencyScore`
- `trendScore`
- `meanGapDays`
- `interventionBreakRate`

V1 does not need all of these populated for every family, but the shape should aim this way.

---

## 15. Continuity With Prior Patterns

## 15.1 Why continuity matters

Pattern inference is not just "generate new patterns every run".

We need to know whether the current horizon:

- strengthens a prior pattern
- weakens a prior pattern
- retires a prior pattern
- rejects a prior pattern
- introduces a new one

## 15.2 Matching rule

Pattern continuity should be based on:

- same family kind
- compatible trigger structure
- compatible episode support set
- overlapping active window

## 15.3 Status transition examples

Examples:

- prior `active` + new support -> remain `active`
- prior `active` + weak recent support -> `weakening`
- prior `weakening` + no recent support -> `retired`
- prior `candidate` + strong new support -> `active`
- prior `candidate` + strong contradiction -> `rejected`

---

## 16. Statement Construction

## 16.1 Statement purpose

`statement` should express the pattern in one bounded sentence.

Good statement:

- "When uncertainty rises, decision-friction blocks tend to replace execution with more research."

Bad statement:

- "You are an avoidant person."

The second is identity language, not pattern language.

## 16.2 Statement template shape

V1 should use template-guided construction, not free-form reflective prose.

Suggested structure:

- repeated condition
- repeated episode consequence
- optional frequency or recentness qualifier

## 16.3 Mechanism versus statement

Keep the fields distinct:

- `statement`: what repeats
- `triggerDescription`: what tends to precede it
- `mechanismDescription`: candidate explanation of why it repeats

This separation will make reports and supervision much easier to build later.

---

## 17. Evidence Link Model

Every pattern should link back to episodes as its canonical evidence.

Suggested link shape:

```text
Episode --pattern_evidence--> PatternHypothesis
```

Optional supporting links may also exist from state or observation only when needed for debug surfaces, but episodes remain primary.

Useful link metadata:

- support role
- sequence position
- trigger contribution
- contradiction flag
- recency weight

Examples of roles:

- `primary_support`
- `trigger_support`
- `contradiction`
- `recent_reinforcement`

---

## 18. Rebuild And Replacement Policy

## 18.1 Rebuild trigger

Pattern rebuild should trigger when:

- episode rebuild changes the target horizon
- intervention outcomes materially change the horizon
- pattern pipeline version changes
- manual rebuild is requested

## 18.2 Replacement unit

Replacement should be bounded by:

- profile
- target horizon
- pattern family set
- pipeline version

Do not try to update one pattern row incrementally from one new episode.

## 18.3 Downstream dirty windows

After pattern rebuild finishes, emit dirty windows for:

- reflection reports
- pattern rollups
- intervention planning later if enabled

Pattern is the canonical upstream input for reflection meaning-making.

---

## 19. What Pattern Builder Must Not Do

Pattern builder must not:

- write diary-like reports
- prescribe actions
- assign personality-level truth
- override episode evidence to fit a favored theory
- present causality as certainty

If pattern builder starts saying:

- "this is definitely your root issue"
- "you should now do X"

then reflection or supervision logic has leaked downward.

---

## 20. Suggested Module Layout

Suggested future layout:

```text
packages/core/src/reflection/pattern/
  define-pattern-families.ts
  build-pattern-candidates.ts
  score-pattern-support.ts
  evaluate-pattern-counterevidence.ts
  reconcile-pattern-lifecycle.ts
  build-pattern-statement.ts

apps/server/src/reflection/pattern/
  run-pattern-horizon.ts
  load-pattern-input-horizon.ts
  write-pattern-hypotheses.ts
  schedule-pattern-horizon.ts
```

Rule:

- `packages/core` owns pure transforms
- `apps/server` owns loading, persistence, scheduling, and rebuild coordination

---

## 21. Phase Plan

## Phase 1: Family Framework

Goal:

- define family taxonomy
- define support and contradiction scoring
- define lifecycle transitions

## Phase 2: V1 Pattern Families

Goal:

- uncertainty -> decision friction
- decision friction -> shallow drift
- meeting load -> recovery or low focus
- sleep debt / low energy -> shallow drift

## Phase 3: Evidence And Quality

Goal:

- counterevidence support
- confidence stabilization
- metrics shape stabilization

## Phase 4: Outcome Awareness

Goal:

- let intervention outcomes modulate weakening and retirement
- surface "pattern interrupted" cases cleanly

---

## 22. Open Questions

These should remain explicit.

### 22.1 Separate pattern identity

Do we eventually want a stronger persistent identity model for patterns across months?

V1 recommendation:

- no separate identity system yet
- use kind plus lifecycle reconciliation first

### 22.2 Family authoring surface

Should pattern families remain code-defined, config-defined, or mixed?

V1 recommendation:

- code-defined first
- move to config only after semantics stabilize

### 22.3 Model assistance

Should trigger or mechanism text ever be model-assisted?

V1 recommendation:

- deterministic or template-guided first
- consider model assistance only after support, contradiction, and lifecycle evaluation are reliable

---

## 23. Summary

The pattern-hypothesis layer should be the first cross-episode interpretation layer in the reflection system.

Its job is to turn repeated episode structures into bounded, confidence-bearing, evidence-backed candidate mechanisms.

The key decisions are:

- keep pattern distinct from report and supervision
- aggregate by horizon, not by single episode append
- reason through explicit pattern families
- make counterevidence first-class
- maintain lifecycle across active, weakening, retired, and rejected states
- keep causal language humble

That gives reflection reports a stable meaning substrate without forcing the report layer to rediscover recurring structure from scratch.
