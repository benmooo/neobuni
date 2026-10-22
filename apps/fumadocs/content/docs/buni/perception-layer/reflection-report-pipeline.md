---
title: "Reflection Report Pipeline"
---

# Reflection Report Pipeline

> Status: Active design
> Date: 2026-05-23
> Companion docs:
>
> - [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> - [./reflection-pipeline-simplification.md](./reflection-pipeline-simplification.md)
> - [./reflection-observation-ingestion-pipeline.md](./reflection-observation-ingestion-pipeline.md)
> - [./reflection-contracts-and-storage.md](./reflection-contracts-and-storage.md)
> - [./reflection-daily-report-design.md](./reflection-daily-report-design.md)
> - [./reflection-report-scheduler.md](./reflection-report-scheduler.md)

## 1. Purpose

This document defines the simplified report pipeline for reflection.

It answers one question:

**how should daily, weekly, and monthly reports be generated after the middle reflection layers are removed?**

This document defines:

- daily report inputs
- weekly and monthly rollup inputs
- LLM boundary
- scheduling model
- report storage shape

It does not define:

- state estimation
- episode building
- pattern hypothesis generation
- context snapshot generation

Those layers are no longer part of the target report design.

---

## 2. Core Decision

Reflection reports become the only synthesis layer above normalized observations.

The target stack is:

```text
RawObservation
  -> Observation
  -> Daily Report
  -> Weekly Report
  -> Monthly Report
```

This means:

- `daily` reports are generated from normalized observations plus LLM synthesis
- `weekly` reports are generated from daily reports
- `monthly` reports are generated from daily reports

Reports no longer depend on:

- state estimates
- episodes
- pattern hypotheses

---

## 3. Period Model

## 3.1 Daily

Daily report answers:

- what happened today
- why it happened
- where the system or workflow had friction
- how tomorrow should evolve

Inputs:

- normalized observations inside one local-calendar day
- purified same-day Codex transcripts projected from normalized `codex_turn` rows
- optional supporting context from lighter same-day sources such as Git
- LLM synthesis

The detailed daily design lives in [./reflection-daily-report-design.md](./reflection-daily-report-design.md).

## 3.2 Weekly

Weekly report answers:

- what repeated across days
- what was improving or degrading
- what work rhythms or friction loops became visible at the week scale

Inputs:

- the set of daily reports inside the week
- optional deterministic counts or summaries derived from those daily reports
- LLM synthesis over the daily-report set

## 3.3 Monthly

Monthly report answers:

- what changed across a longer horizon
- which themes persisted
- which daily patterns accumulated into something worth surfacing

Inputs:

- the set of daily reports inside the month
- optional deterministic monthly aggregates
- LLM synthesis over the daily-report set

---

## 4. LLM Boundary

The LLM belongs in the report layer, not in normalize.

Rules:

- normalize remains deterministic
- report synthesis may use LLMs
- daily report input should stay close to the original work conversation rather than aggressively compressing it
- token pressure is not the primary design driver for the daily report

That keeps:

- source handling deterministic
- important user intent and preference signal inside the transcript
- report generation easier to audit and rerun

---

## 5. Daily Report Build

Recommended sequence:

1. load normalized observations for the target day
2. project Codex turns into purified report transcripts that keep user and assistant messages while dropping tool and reasoning noise
3. add optional lighter same-day source context such as Git commits
4. build one transcript-first `DailyReflectionInput`
5. call the LLM once to synthesize one grounded daily reflection
6. validate structured output
7. persist one `daily` `ReflectionReport` with markdown plus structured sections

The daily report builder should not need raw source payloads for standard generation.

---

## 6. Weekly And Monthly Build

Recommended sequence:

1. load daily reports for the target week or month
2. compute deterministic rollups across those daily reports
3. build a bounded rollup input object
4. call LLM to synthesize weekly or monthly report sections
5. persist one `weekly` or `monthly` `ReflectionReport`

Important rule:

- weekly and monthly reports should synthesize from daily reports, not from raw observations directly

This keeps the hierarchy legible and reduces compute fanout.

---

## 7. Scheduling Model

Recommended jobs:

- `daily-report-build`
- `weekly-report-build`
- `monthly-report-build`

Recommended triggers:

- end-of-day scheduled build for daily
- built daily reports mark their containing week dirty
- built daily reports mark their containing month dirty
- manual rebuild remains available for all periods

Important rule:

- `weekly` and `monthly` dirty marks do not mean "build immediately"
- they mean "this closed-period report must be recomputed once its window is closed"
- the queue should leave open-week and open-month marks pending until their `windowEnd`

Current manual rebuild entry points:

- local CLI: `bun run reflection:report:rebuild-daily --last-days 3`
- local CLI readback: `bun run reflection:report:show-daily --last-days 3`
- local CLI input inspection: `bun run reflection:report:inspect-daily-input --last-days 1`
- server route: `POST /v1/reflection/reports/rebuild-daily?lastDays=3`
- server route readback: `GET /v1/reflection/reports/recent-daily?lastDays=3`
- server route input inspection: `GET /v1/reflection/reports/recent-daily/input?lastDays=1`

The dedicated `rebuild-daily` entry marks the target `daily` windows dirty, rebuilds only those daily windows directly, and leaves any derived `weekly` or `monthly` windows dirty for later closed-period queue consumption.

Ingest should not synchronously run these jobs.

---

## 8. Lineage Model

The target design should not rely on `reflection_links`.

Instead, reports should store direct source ids:

- daily report stores `sourceObservationIds`
- weekly and monthly reports may later store `sourceDailyReportIds`

That gives enough provenance for V1 without reintroducing high-fanout lineage tables.

---

## 9. Status Model

`ReflectionReport` can still keep:

- `status`
- `summary`
- `facts`
- `cognition`
- `system`
- `evolution`
- `themes`
- `confidence`

But interpretation changes:

- daily report should render mainly as markdown
- structured fields should support indexing and later rollups
- `facts`, `cognition`, `system`, and `evolution` should come from normalized observations or daily-report rollups

---

## 10. Migration Direction

The new report pipeline replaces the old:

```text
Observation
  -> StateEstimate
  -> Episode
  -> PatternHypothesis
  -> ReflectionReport
  -> ContextSnapshot
```

with:

```text
Observation
  -> Daily Report
  -> Weekly / Monthly Report
```

That is the target architecture going forward.
