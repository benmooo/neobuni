---
title: "Buni Schedule Cron Recurrence V1"
---

# Buni Schedule Cron Recurrence V1

> Status: implemented
> Date: 2026-05-30
> Companion docs:
>
> - [./schedule-runtime-dataflow-v1.md](./schedule-runtime-dataflow-v1.md)

## Purpose

This document defines the first durable recurring-schedule design for Buni.

The goal is to support real cron-backed schedules without replacing the existing
DB-backed due runner.

## Design Summary

Buni keeps the current execution boundary:

```text
schedule row in SQLite
  -> next triggerAt persisted in DB
  -> due runner polls for triggerAt <= now
  -> delivery executes schedule effects
  -> recurring schedules compute and persist the next triggerAt
```

What changes in V1 is the recurrence engine:

- `cronExpr` is now validated and evaluated with `croner`
- recurrence planning is centralized in one pure planner
- REST schedule writes and tool-authored recurring schedules share the same planning logic
- delivery rescheduling is generic and no longer limited to daily `minute hour * * *`

The core scheduling layer has one recurrence contract only:

- `cronExpr`

If product-facing tools later want friendlier authoring forms such as `daily`,
`weekly`, or `monthly`, those shapes must stay above the scheduling boundary and
compile into `cronExpr` before persistence or delivery planning.

## Implementation Checklist

- [x] Add `croner` to `@buni/server` and keep SQLite `triggerAt` as the durable next-run field.
- [x] Replace the old daily-only recurrence parser with pure helpers for:
  - cron validation
  - explicit `triggerAt` matching
  - next-run calculation
  - preview run calculation
- [x] Keep the core recurrence contract cron-only:
  - no `daily | weekly | monthly | cron` union inside schedule persistence or schedule planning
- [x] Centralize recurring schedule planning for create/update flows in one pure module.
- [x] Reject semantic write errors at the API boundary:
  - malformed `cronExpr`
  - explicit `triggerAt` that does not match `cronExpr` in the chosen timezone
- [x] Replan recurring schedules when `cronExpr`, `timezone`, explicit `triggerAt`, or reactivation changes the recurrence meaning.
- [x] Keep the due runner selection model unchanged:
  - DB row stores the next `triggerAt`
  - due runner polls `triggerAt <= now`
  - delivery persists the next `triggerAt` after a successful recurring run
- [x] Route all recurring schedule authors through the same planner:
  - `/v1/schedules`
  - `schedule_news_brief`
- [x] Let `schedule_news_brief` accept direct `cronExpr` input instead of forcing a datetime-resolution step.
- [x] Add verification coverage for:
  - recurrence helper semantics
  - planner semantics
  - due-runner recurring reschedule behavior
  - route-level `400` handling for invalid cron planning

## Why not use in-memory Croner jobs directly

Croner can schedule in-memory jobs, but Buni does not use that as the source of truth.

The source of truth stays in SQLite because Buni needs:

- durable scheduling across process restarts
- one clear `next triggerAt` field for observability
- the option to coordinate multiple processes later

Croner is used only as a pure cron parser and next-run calculator.

## Boundaries

### Functional core

Pure schedule planning lives in:

- `apps/server/src/schedules/recurrence.ts`
- `apps/server/src/schedules/plan-schedule.ts`

These modules do:

- validate cron expressions
- check whether an explicit `triggerAt` matches a cron expression
- compute the next run time
- compute preview runs and local display text

### Imperative shell

The shell remains:

- `routes/schedules.ts`
- `tools/schedule-news-brief.ts`
- `schedules/due-runner.ts`
- `schedules/delivery.ts`

These modules do:

- accept input
- persist schedules
- run delivery side effects
- update DB state after delivery

## Supported Cron Semantics

V1 intentionally uses Croner in `5-part` mode.

That means Buni accepts:

- `MINUTE HOUR DAY-OF-MONTH MONTH DAY-OF-WEEK`

Examples:

- daily: `0 8 * * *`
- weekly: `0 9 * * MON`
- month-end: `0 18 L * *`
- nearest weekday: `0 10 1W * *`
- nth weekday: `0 9 * * MON#1`
- explicit AND logic: `0 12 1 * +MON`

V1 does **not** rely on second-level cron precision because the due runner is still polling on an interval.

## Planning Rules

### Create

When `cronExpr` is absent:

- Buni stores the schedule as a one-shot item

When `cronExpr` is present:

- Buni validates the cron expression with Croner
- if an explicit `triggerAt` is provided, it must match `cronExpr` in the selected timezone
- otherwise Buni computes the next trigger from `referenceNow`

### Update

When a recurring schedule is changed:

- if `cronExpr`, `timezone`, or explicit `triggerAt` changes, Buni replans `triggerAt`
- if a non-active recurring schedule is reactivated, Buni replans `triggerAt` from `referenceNow`
- if recurrence is untouched, Buni preserves the existing next trigger

## Delivery Rules

One-shot schedules:

- complete after successful delivery

Recurring schedules:

- stay `active`
- persist `deliveredAt` for the latest successful run
- compute the next `triggerAt` using Croner after successful delivery
- clear per-run channel delivery state before re-arming the next run

## Current Limitations

V1 still has these limits:

- no catch-up replay for many missed runs; delivery moves to the next future run
- no separate recurrence metadata table
- no user-facing cron preview API yet
- no distributed lock/claim layer for multi-instance execution

## Files

Primary files for this design:

- `apps/server/src/schedules/recurrence.ts`
- `apps/server/src/schedules/plan-schedule.ts`
- `apps/server/src/routes/schedules.ts`
- `apps/server/src/schedules/delivery.ts`
- `apps/server/src/tools/schedule-news-brief.ts`
- `apps/server/src/routes/schedules.test.ts`
