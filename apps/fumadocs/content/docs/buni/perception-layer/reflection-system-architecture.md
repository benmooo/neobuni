---
title: "Reflection System Architecture"
---

# Reflection System Architecture

> Status: Superseded by simplified reflection design
> Date: 2026-05-04
> Companion docs:
>
> - [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> - [./perception-signal-adapters-v1.md](./perception-signal-adapters-v1.md)
> - [./reflection-contracts-and-storage.md](./reflection-contracts-and-storage.md)
> - [./reflection-observation-ingestion-pipeline.md](./reflection-observation-ingestion-pipeline.md)
> - [./reflection-push-ingestion-substrate.md](./reflection-push-ingestion-substrate.md)
> - [./reflection-source-git.md](./reflection-source-git.md)
> - [./reflection-state-estimate-pipeline.md](./reflection-state-estimate-pipeline.md)
> - [./reflection-episode-pipeline.md](./reflection-episode-pipeline.md)
> - [./reflection-pattern-hypothesis-pipeline.md](./reflection-pattern-hypothesis-pipeline.md)
> - [./reflection-report-pipeline.md](./reflection-report-pipeline.md)
> - [./reflection-context-pipeline.md](./reflection-context-pipeline.md)
> - [../runtime-kernel-implementation-plan.md](../runtime-kernel-implementation-plan.md)
> - [../memory-system/memory-system-v2.md](../memory-system/memory-system-v2.md)

> Superseded Note:
> This document describes the older multi-layer reflection design.
> The active target design is now documented in [./reflection-pipeline-simplification.md](./reflection-pipeline-simplification.md), which removes state, episode, pattern, and context from the target pipeline.

## 1. Purpose

This document defines the architecture for Buni's longitudinal reflection system.

The goal is not to bolt a "reflection prompt" onto chat.

The goal is to build a system that can:

1. continuously collect multi-source life data
2. normalize it into structured observations
3. turn observations into interpretable episodes and patterns
4. produce daily, weekly, and monthly reflection artifacts
5. drive gentle supervision and intervention loops
6. expose the right compressed context back into chat turn runtime

This system should help answer:

- what happened
- what pattern is repeating
- what likely caused it
- what belief or coping strategy is underneath it
- what intervention helps

The core product principle is:

**If it cannot be seen, it cannot be understood.  
If it cannot be understood, it cannot be reflected on.  
If it cannot be reflected on, it is hard to change.**

---

## 2. Why This Is A New Layer

The current perception layer is turn-scoped.

It normalizes immediate context for a single chat turn:

- current user text
- recent user texts
- nearby memory slices
- nearby schedule state
- recent runtime behavior
- local time context

That is the right shape for interaction-time perception.

It is not the right shape for reflection.

Reflection requires:

- continuous ingestion instead of only turn-time loading
- multi-source observations instead of only chat-adjacent context
- cross-source temporal stitching instead of isolated signals
- pattern and causal inference instead of local heuristics only
- periodic synthesis instead of one-turn reasoning

So this feature should not be modeled as "more adapters in `SignalSet`".

We need a new longitudinal layer:

```text
Source Connectors
  -> Local Push Bridges / Import Fallback
  -> Observation Ingestion
  -> Observation Normalization
  -> State and Episode Modeling
  -> Pattern and Reflection Engine
  -> Supervision Engine
  -> Turn-time Runtime Integration
```

---

## 3. Design Principles

### 3.1 Observation first, signal second

Raw life data should first become structured observations.

Only after that should the system derive:

- state estimates
- episodes
- patterns
- reflection signals

### 3.2 Narrative before summary

The system should not jump directly from raw events to reflection text.

It should first build narrative units such as:

- a distraction episode
- a fatigue episode
- a focused work block
- an uncertainty-driven information binge

### 3.3 Reflection artifacts are not just signals

Signals are good for turn-time hints.

Reflection artifacts are larger cognitive assets:

- pattern hypotheses
- reflection reports
- intervention histories

These should not be squeezed into `SignalSet`.

### 3.4 Functional core, imperative shell

Pure modules should own:

- observation normalization
- state estimation
- episode segmentation
- pattern hypothesis construction
- reflection report synthesis inputs
- supervision policy construction

I/O modules should own:

- OS or device integrations
- external API ingestion
- scheduling and polling
- persistence
- notification delivery
- UI queries

### 3.5 Push-first first-party collection

For first-party local sources, the default operating model should be push-first.

That means:

- local bridges observe events where they originate
- local bridges push signed batches into Buni
- `import` remains for backfill and repair
- `poll` remains optional for sources that cannot practically push

This is the right boundary for browser activity, local git commits, and Codex session summaries.

### 3.5 Interpretability over model mystique

Every important reflection should be traceable to:

- which observations contributed
- which episodes were inferred
- which pattern rules or model outputs were used
- what confidence the system has

The system should be able to say:

```text
At 15:03 stress markers rose.
At 15:07 short-video consumption began.
At 15:42 decision-related work remained inactive.
Hypothesis: uncertainty triggered avoidance masked as passive information intake.
```

not merely:

```text
You seem avoidant today.
```

### 3.6 Coaching, not command

Supervision is not a controller.

It should behave like a cognitive coach:

- suggest
- reframe
- redirect
- scaffold choices
- measure intervention effect

It should not become a rigid compliance machine.

---

## 4. System Scope

The reflection system covers four major functions.

### 4.1 Continuous perception

Collect and normalize multi-source life data:

- behavior logs
- physiology
- location
- content consumption
- thought traces
- emotional traces
- work output

### 4.2 Visualization

Expose structured views over:

- timeline
- routines
- deviations
- correlations
- repeated patterns
- intervention effect

### 4.3 Reflection

Produce periodic meaning-making outputs:

- daily reflection
- weekly review
- monthly synthesis

### 4.4 Supervision

Turn understanding into gentle action:

- personalized nudges
- resource recommendations
- rest reminders
- project-related redirection
- intervention effectiveness learning

---

## 5. High-Level Architecture

```text
External Sources
  -> Source Connectors
  -> Raw Observation Log
  -> Observation Normalizer
  -> State Estimator
  -> Episode Builder
  -> Pattern Engine
  -> Reflection Generator
  -> Supervision Engine
  -> Visualization Read Models
  -> Chat Runtime Context Adapter
```

More explicitly:

```text
Apple Watch / Health / GPS / Screen Time / Browser / Podcasts / Video / Journal / Voice / Meetings / Git
  -> local push bridges, imports, or external event adapters
  -> RawObservation
  -> Observation
  -> StateEstimate
  -> Episode
  -> PatternHypothesis
  -> ReflectionReport
  -> InterventionPlan / InterventionOutcome
```

Turn-time runtime should consume only compressed outputs:

```text
ReflectionContext
  + ReflectionSignals
  -> chat turn runtime
```

---

## 6. Layer Boundaries

## 6.1 Source connector layer

Responsibilities:

- poll or receive source data
- convert provider-specific payloads into raw observation records
- attach provenance and connector metadata
- remain source-specific

Non-responsibilities:

- no life interpretation
- no pattern inference
- no reflection text generation

Examples:

- screen time connector
- Apple Watch or health connector
- GPS history connector
- browser history connector
- podcast and video consumption connector
- journaling and note connector
- meeting minutes connector
- git activity connector

## 6.2 Observation layer

Responsibilities:

- normalize source data into one domain contract
- deduplicate overlapping data
- merge repeated low-level events where appropriate
- preserve source and confidence metadata

This layer should answer:

- what happened
- when
- from which source
- with what confidence

## 6.3 State layer

Responsibilities:

- infer latent state from observations
- estimate energy, stress, focus, social openness, uncertainty, overwhelm, etc.
- remain bounded and time-scoped

This layer should not yet generate narratives.

It should produce things like:

- elevated fatigue window
- reduced focus window
- likely emotional activation spike
- prolonged low-mobility period

## 6.4 Episode layer

Responsibilities:

- segment streams into meaningful episodes
- stitch multiple observations into interpretable units
- represent sequence and context

This is where the system moves from "data points" to "story fragments".

Examples:

- deep work block
- shallow browsing drift
- uncertainty-driven research loop
- fatigue and doomscrolling episode
- meeting-heavy social depletion block
- late-night rumination block

## 6.5 Pattern layer

Responsibilities:

- identify repeated episode structures
- infer candidate mechanisms and hypotheses
- track repetition frequency, trigger contexts, and outcome effects

This is where the system produces:

- "When uncertainty rises, passive learning tends to replace decision-making."
- "Sleep debt correlates with late-day phone drift and lower git output."
- "Meeting-heavy mornings predict lower evening social tolerance."

## 6.6 Reflection layer

Responsibilities:

- synthesize artifacts from episodes and patterns
- produce daily, weekly, and monthly reports
- maintain links back to supporting evidence

This layer should produce meaning, not just summary.

## 6.7 Supervision layer

Responsibilities:

- propose interventions
- deliver nudges through the right surface
- track acceptance, rejection, and downstream outcome
- adapt intervention style over time

This layer is downstream of reflection, not upstream.

---

## 7. Core Domain Model

The following types are directional, not final API names.

### 7.1 RawObservation

Provider-specific event before normalization.

```ts
type RawObservation = {
  id: string;
  source: string;
  sourceEventId: string | null;
  capturedAt: string;
  payload: Record<string, unknown>;
  provenance: Record<string, unknown>;
};
```

### 7.2 Observation

Normalized event in a common language.

```ts
type Observation = {
  id: string;
  profileId: string;
  source:
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
  category: "behavior" | "physiology" | "location" | "consumption" | "thought" | "emotion" | "work";
  startedAt: string;
  endedAt: string | null;
  summary: string;
  payload: Record<string, unknown>;
  confidence: number;
  provenance: Record<string, unknown>;
};
```

### 7.3 StateEstimate

Bounded inferred state over a time window.

```ts
type StateEstimate = {
  id: string;
  profileId: string;
  windowStart: string;
  windowEnd: string;
  dimensions: {
    energy: number | null;
    stress: number | null;
    focus: number | null;
    uncertainty: number | null;
    socialLoad: number | null;
    emotionalVolatility: number | null;
  };
  confidence: number;
  sourceObservationIds: string[];
};
```

### 7.4 Episode

Narrative unit built from multiple observations and state estimates.

```ts
type Episode = {
  id: string;
  profileId: string;
  kind:
    | "deep_work"
    | "shallow_drift"
    | "recovery"
    | "avoidance_loop"
    | "rumination"
    | "learning_binge"
    | "meeting_overload"
    | "sleep_debt_day";
  startedAt: string;
  endedAt: string;
  summary: string;
  storyBeats: Array<{
    ts: string;
    label: string;
    observationIds: string[];
  }>;
  stateSnapshot: Record<string, unknown>;
  confidence: number;
  sourceObservationIds: string[];
};
```

### 7.5 PatternHypothesis

Repeated or causal candidate pattern.

```ts
type PatternHypothesis = {
  id: string;
  profileId: string;
  kind:
    | "uncertainty_avoidance"
    | "fatigue_scroll_loop"
    | "meeting_depletion"
    | "sleep_output_coupling"
    | "emotion_work_coupling";
  statement: string;
  triggerDescription: string;
  mechanismDescription: string;
  counterevidenceDescription: string | null;
  confidence: number;
  supportingEpisodeIds: string[];
  activeWindowStart: string | null;
  activeWindowEnd: string | null;
};
```

### 7.6 ReflectionReport

Periodic reflective synthesis artifact.

```ts
type ReflectionReport = {
  id: string;
  profileId: string;
  period: "daily" | "weekly" | "monthly";
  windowStart: string;
  windowEnd: string;
  summary: string;
  facts: string[];
  patterns: string[];
  metaCognition: string[];
  keyEpisodeIds: string[];
  keyPatternIds: string[];
  confidence: number;
};
```

### 7.7 InterventionPlan

Action proposal created from reflection context.

```ts
type InterventionPlan = {
  id: string;
  profileId: string;
  createdAt: string;
  goal: string;
  style: "gentle_redirect" | "resource_push" | "recovery_prompt" | "focus_prompt";
  actions: Array<{
    kind:
      | "push_resource"
      | "remind_break"
      | "remind_hydration"
      | "prompt_walk"
      | "prompt_decision"
      | "prompt_reflection";
    content: string;
    channel: "chat" | "notification" | "dashboard";
  }>;
  sourcePatternIds: string[];
  sourceReflectionReportIds: string[];
};
```

### 7.8 InterventionOutcome

Observed result of supervision.

```ts
type InterventionOutcome = {
  id: string;
  profileId: string;
  interventionPlanId: string;
  observedAt: string;
  outcome: "accepted" | "ignored" | "dismissed" | "partially_effective" | "effective";
  notes: string | null;
  followupObservationIds: string[];
};
```

---

## 8. Source Families

The system should treat the following as first-class source families.

## 8.1 Behavior logs

Examples:

- screen time
- app usage
- unlock count
- app switching frequency
- foreground session durations

Purpose:

- detect drift
- detect fragmentation
- detect focused blocks
- detect compulsive or repetitive checking

## 8.2 Physiology

Examples:

- sleep duration
- sleep stages
- resting heart rate
- HRV
- workout and recovery markers

Purpose:

- estimate fatigue
- detect recovery debt
- correlate body state with attention and mood

## 8.3 Location and movement

Examples:

- GPS trajectory
- stay points
- walking versus stationary time
- commute and place transitions

Purpose:

- contextualize episodes
- detect isolation, overconfinement, or environmental transitions

## 8.4 Content consumption

Examples:

- browsing history
- podcast listening
- video viewing
- article and feed sessions

Purpose:

- distinguish research from drift
- distinguish intentional learning from avoidance-through-intake

## 8.5 Thought traces

Examples:

- journals
- voice notes
- writing fragments
- meeting notes
- transcripts

Purpose:

- capture self-expressed concerns
- capture goal articulation
- capture conflict, uncertainty, and desire language

## 8.6 Emotion traces

Examples:

- manual mood tagging
- text sentiment
- voice tone analysis
- reflected emotional labels from journaling or meetings

Purpose:

- estimate emotional pattern and variability
- connect internal state to behavioral episodes

## 8.7 Work output

Examples:

- git commits
- issue movement
- project progress markers
- task creation and closure

Purpose:

- measure production
- correlate output with state and environment

---

## 9. Continuous Perception Pipeline

## 9.1 Ingestion

Each source connector should feed a source-specific ingestion job.

```text
source API or local feed
  -> connector pull or webhook
  -> RawObservation append
```

This step should be append-only where possible.

## 9.2 Normalization

Raw observations are normalized into the shared `Observation` contract.

This step should:

- map source fields to domain fields
- standardize timestamps
- standardize category and source labels
- assign confidence
- preserve provenance

## 9.3 Deduplication and compaction

The system should merge noisy low-level events into bounded units when possible.

Examples:

- many short screen foreground events -> one app usage block
- repeated GPS pings at one place -> one location stay
- many browser URLs in one session -> one browsing episode candidate

## 9.4 State estimation

This stage infers low-level latent states from recent observations.

Examples:

- likely fatigue
- elevated uncertainty
- likely overstimulation
- prolonged sedentary period

## 9.5 Episode building

This stage creates narrative slices.

Examples:

- 14:00 to 15:20 focused implementation block
- 15:20 to 16:05 uncertainty and video drift block
- 23:40 to 00:30 late-night rumination block

## 9.6 Pattern inference

This stage links repeated episodes into hypotheses.

Examples:

- uncertainty often precedes information binge episodes
- poor sleep correlates with afternoon fragmentation
- meeting-heavy days correlate with lower evening reflective capacity

## 9.7 Reflection generation

Periodic jobs produce reports at:

- end of day
- end of week
- end of month

## 9.8 Supervision loop

Interventions are generated from pattern and reflection outputs and evaluated by later observations.

---

## 10. Episode And Narrative Model

Reflection quality depends on episode quality.

Episodes are the bridge between data and meaning.

## 10.1 Why episodes matter

Without episodes, the system only knows isolated facts:

- watched videos
- opened browser
- no git commits
- elevated stress

With episodes, the system can express:

- under deadline pressure, consumption shifted from project research into short-form drift
- distress language in notes preceded a low-output evening
- after two long meetings, app-switching increased and focused work collapsed

## 10.2 Episode segmentation heuristics

V1 can use deterministic heuristics first.

Examples:

- time gap boundaries
- source transition boundaries
- state shift boundaries
- location change boundaries
- work output start or stop boundaries

Later versions can add model-assisted segmentation.

## 10.3 Cross-source stitching

Episode builder should explicitly combine sources.

Example:

```text
15:00 elevated stress estimate
15:05 browser switch to YouTube
15:07 short video session begins
15:40 still no project activity
15:50 journal note about avoiding decision
```

This becomes one richer episode, not five disconnected rows.

---

## 11. Pattern And Causal Inference

Reflection should aim beyond factual recap.

We want statements closer to:

- "When uncertainty rises, passive learning tends to replace committing to a decision."
- "Late sleep debt predicts more fragmented attention and lower willingness to initiate difficult work."
- "Meeting-heavy mornings often lead to low social and cognitive bandwidth by evening."

## 11.1 Pattern hypothesis structure

Every pattern should track:

- triggering context
- repeated evidence
- supporting episodes
- confidence
- counterevidence
- possible intervention styles

## 11.2 Causal humility

The system should infer causal structure carefully.

It should use language like:

- likely pattern
- candidate mechanism
- repeated association
- plausible coping strategy

It should avoid presenting uncertain causality as truth.

## 11.3 Meta-cognitive focus

The strongest reflection outputs should highlight:

- coping strategies
- self-protective patterns
- avoidance disguises
- identity or belief loops
- decision habits

Examples:

- learning as avoidance
- busyness as emotional defense
- reflection without commitment
- productivity collapse after uncertainty spikes

---

## 12. Reflection Engine

The reflection engine should produce periodic artifacts, not one-off chat completions.

## 12.1 Daily reflection

Daily reflection should answer:

- what shaped today
- which episodes mattered most
- what pattern appeared
- what was the cost
- what small shift is worth trying tomorrow

## 12.2 Weekly reflection

Weekly reflection should answer:

- what repeated across days
- what conditions correlated with good work or poor regulation
- what interventions helped
- what theme deserves attention next week

## 12.3 Monthly reflection

Monthly reflection should answer:

- what changed over longer horizons
- which patterns strengthened or weakened
- what identity-level or belief-level loops are visible
- what deserves structural adjustment

## 12.4 Reflection output structure

Reflection reports should explicitly separate:

- facts
- patterns
- meta-cognition
- suggested experiments

That keeps reporting from collapsing into shallow diary summary.

---

## 13. Visualization Layer

Visualization should sit on top of reflection data, not replace it.

## 13.1 Primary views

V1 visualization should prioritize:

- daily timeline
- episode timeline
- weekly rhythm view
- pattern cards
- intervention effectiveness board

## 13.2 Daily timeline

Show:

- observations
- state estimates
- episodes
- interventions

This makes it possible to inspect why a reflection was generated.

## 13.3 Weekly rhythm map

Show recurring structures:

- productive windows
- fatigue windows
- distraction windows
- emotional volatility windows

## 13.4 Pattern cards

Each pattern card should show:

- statement
- trigger
- likely mechanism
- evidence count
- confidence
- trend direction

## 13.5 Intervention board

Show:

- what was suggested
- when
- whether it was acted on
- whether later outcomes improved

---

## 14. Supervision And Coaching Layer

Supervision should convert reflection into supportive action.

## 14.1 Goal

Help the user choose a better path without removing autonomy.

## 14.2 Intervention classes

Examples:

- rest prompts
- hydration prompts
- walk prompts
- focus reset prompts
- decision prompts
- resource recommendations
- project-relevant article or video surfacing

## 14.3 Style rules

The coach should be:

- contextual
- progressive
- non-shaming
- low-friction
- adaptive to prior response

## 14.4 Outcome tracking

Every intervention should later be scored against downstream evidence.

Examples:

- did work resume
- did app drift shrink
- did emotional volatility drop
- was the suggestion ignored

This allows the system to learn:

- what works
- what annoys
- what should back off

---

## 15. Runtime Integration

This system should not dump full reflection reports into chat turn runtime.

Instead it should expose three different integration surfaces.

## 15.1 Reflection artifacts

These are long-lived cognitive assets.

Examples:

- reflection reports
- pattern hypotheses
- episode summaries
- intervention outcomes

These should live in their own store and be retrievable like cognition assets.

## 15.2 Reflection context

This is the main chat runtime integration point.

Suggested shape:

```ts
type ReflectionContext = {
  activePatterns: Array<{
    id: string;
    kind: string;
    statement: string;
    confidence: number;
  }>;
  recentReflectionSummary: string | null;
  interventionState: {
    activeGoals: string[];
    recentEffectiveInterventions: string[];
    recentIgnoredInterventions: string[];
  };
  currentEpisode: {
    kind: string;
    summary: string;
    confidence: number;
  } | null;
};
```

This should enter `TurnContext`, not `SignalSet`.

## 15.3 Reflection signals

A smaller subset may also be projected into turn-time signals.

Examples:

- `pattern_active`
- `risk_window`
- `intervention_fatigue`
- `coaching_opportunity`

These are runtime hints, not the primary artifact surface.

## 15.4 Runtime boundary rule

The chat turn runtime should consume compressed reflection outputs:

- relevant active pattern
- relevant current episode
- recent supervision state

It should not ingest:

- full source logs
- full observation timelines
- full reflection history

That keeps turn runtime bounded.

---

## 16. Storage Model Direction

We do not need final schema here, but we do need clear storage families.

Suggested families:

```text
raw_observations
observations
state_estimates
episodes
pattern_hypotheses
reflection_reports
intervention_plans
intervention_outcomes
visualization_read_models
```

### Rule

Do not over-normalize too early.

This project is early-stage. We should favor:

- clear contracts
- high iteration speed
- easy deletion and rebuild

over premature schema elegance.

---

## 17. Suggested File Layout

Suggested future layout:

```text
packages/contracts/src/reflection/
  observation.ts
  episode.ts
  pattern.ts
  reflection.ts
  supervision.ts

packages/core/src/reflection/
  normalize-observation.ts
  estimate-state.ts
  build-episodes.ts
  infer-patterns.ts
  build-reflection-report.ts
  build-supervision-plan.ts

apps/server/src/reflection/
  connectors/
  ingestion/
  pipelines/
  queries/
  supervision/
```

This keeps reflection as a real subsystem rather than a runtime utility folder.

---

## 18. Phase Plan

## Phase 1: Observation Foundation

Goal:

- create contracts
- create ingestion pipeline
- persist normalized observations

Recommended first sources:

- git
- manual emotion tags
- journal or notes

Why:

- they are high signal
- they are relatively easy to ingest
- they already support work, emotion, and thought correlation

## Phase 2: Episode Builder

Goal:

- derive narrative units from observations

Recommended first episode kinds:

- deep work
- shallow drift
- avoidance loop
- recovery block

## Phase 3: Reflection Reports

Goal:

- daily and weekly reflection generation

V1 should be evidence-backed and sparse rather than chatty.

## Phase 4: Visualization

Goal:

- timeline and pattern surfaces

Recommended first views:

- daily timeline
- weekly pattern board
- intervention board

## Phase 5: Supervision

Goal:

- generate light interventions
- measure outcomes

Recommended first actions:

- hydration reminder
- break or walk suggestion
- project-related resource suggestion
- gentle decision prompt

---

## 19. Open Questions

These should remain explicit.

### 19.1 Connector strategy

Should source connectors be:

- local-device first
- server-ingested via sync
- hybrid

### 19.2 Privacy boundary

Which sources should be:

- fully stored
- summarized only
- local-only
- opt-in with explicit retention policy

### 19.3 Model usage

Which stages should be:

- deterministic
- lightweight model-assisted
- fully LLM-synthesized

Recommendation:

- keep ingestion and episode building mostly deterministic first
- allow model assistance at reflection synthesis time

### 19.4 Identity and belief modeling

How far should the system go in naming:

- beliefs
- values conflict
- self-concept patterns

This should be introduced carefully and only with strong evidence.

---

## 20. Summary

The reflection system should be treated as a new longitudinal cognition and perception subsystem.

It is not:

- a bigger `SignalSet`
- a prompt add-on
- a dashboard over raw logs

It is:

- a continuous observation system
- an episode and pattern builder
- a periodic reflection engine
- a coaching and supervision loop
- a bounded context provider back into chat runtime

The most important architectural move is this:

```text
Raw data
  -> Observation
  -> Episode
  -> Pattern
  -> Reflection
  -> Supervision
  -> Runtime Context
```

That is the path from data to meaning, and from meaning to change.
