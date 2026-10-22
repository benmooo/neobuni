---
title: "Reflection Report Scheduler"
---

# Reflection Report Scheduler

> Status: Active design
> Date: 2026-05-24
> Companion docs:
> - [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> - [./reflection-report-pipeline.md](./reflection-report-pipeline.md)
> - [./reflection-pipeline-simplification.md](./reflection-pipeline-simplification.md)
> - [./reflection-daily-report-design.md](./reflection-daily-report-design.md)

## 1. Purpose

This document defines the runtime scheduler for reflection reports.

It answers one practical question:

**how do daily, weekly, and monthly reports get built automatically without reintroducing a deep pipeline?**

This document covers:

- runtime topology
- trigger rules
- per-profile timezone behavior
- catch-up and recovery
- queue draining behavior
- observability and operator controls

---

## 2. Core Decision

Reflection report scheduling should use **one small server-internal periodic sweep**, not three separate cron jobs.

The active runtime model becomes:

```text
server process
  -> reflection report scheduler tick
  -> mark due daily windows dirty
  -> drain dirty report queue
  -> daily build marks containing week/month dirty
  -> same queue may continue into weekly/monthly
```

This means:

- `daily` has an explicit scheduler trigger
- `weekly` and `monthly` remain derived from `daily`
- the scheduler is timezone-aware per profile
- catch-up after downtime is automatic
- manual rebuild routes and CLIs remain valid

We intentionally do **not** add:

- a separate weekly cron
- a separate monthly cron
- a dedicated external worker service in V1

---

## 3. Scheduling Model

## 3.1 Tick loop

The server owns one periodic loop:

- default tick interval: every `60s`
- implementation lives inside the server process
- one tick sweeps all active profiles

The loop should be lightweight:

- compute which closed local-calendar days are now due
- mark those `daily` windows dirty
- run the existing dirty queue for that profile

## 3.2 Daily trigger

For each profile:

- take the profile timezone
- apply a daily grace period after local midnight
- after that grace period, the **previous local day** becomes eligible

Default rule:

- build yesterday's daily report after local `00:05`

This avoids racing with late-arriving events around midnight.

## 3.3 Weekly and monthly trigger

Weekly and monthly are **not** independently scheduled.

Instead:

- when a `daily` report is built, it marks the containing `weekly` window dirty
- it also marks the containing `monthly` window dirty
- the same scheduler tick can continue draining the dirty queue
- but `weekly` and `monthly` marks are only eligible after their period window is closed

So weekly/monthly usually appear:

- after the relevant week or month has actually closed, on a later queue drain

This keeps orchestration simple and lineage explicit.

---

## 4. Catch-up Model

The scheduler must survive:

- server restarts
- laptop sleep
- several missed days
- first-time scheduler enablement

To support that, the scheduler keeps a small per-profile cursor state:

- latest local day that has already been scheduled for daily rebuild
- last sweep time
- last success time
- last error time and error payload

Rules:

- if the server was down for multiple days, the next sweep schedules every missed closed local day after the stored cursor
- if the scheduler has never run before for a profile, it schedules a bounded initial backfill window

Default initial backfill:

- last `7` closed local days

This gives immediate recent coverage without trying to rebuild all historical time in one startup.

## 4.1 Empty days

If a scheduled day has no observations:

- the daily build returns `null`
- the scheduler still advances the cursor for that local day

Otherwise it would retry the same empty day forever.

---

## 5. Queue Draining

After marking due daily windows dirty, the scheduler runs the existing dirty queue for that profile.

Default behavior:

- bounded queue drain per tick
- stop when either:
  - no dirty marks remain
  - the configured per-tick build limit is reached

Recommended default:

- `50` report builds per profile per tick

This bound protects the server from unbounded startup catch-up while still making steady progress.

---

## 6. Runtime Topology

The scheduler runs inside `apps/server/src/index.ts` startup.

That gives:

- no extra deployment unit
- access to existing DB repos and report functions
- consistent local-dev behavior

The loop itself should be implemented as:

- a small imperative shell
- pure helper functions for date/window derivation and due-window computation

This keeps the time logic testable and isolated from timers.

---

## 7. Configuration

Recommended env knobs:

- `BUNI_REFLECTION_REPORT_SCHEDULER_ENABLED`
- `BUNI_REFLECTION_REPORT_SCHEDULER_TICK_MS`
- `BUNI_REFLECTION_REPORT_SCHEDULER_DAILY_GRACE_MINUTES`
- `BUNI_REFLECTION_REPORT_SCHEDULER_INITIAL_BACKFILL_DAYS`
- `BUNI_REFLECTION_REPORT_SCHEDULER_QUEUE_LIMIT_PER_PROFILE`

Recommended defaults:

- enabled: `true`
- tick: `60000`
- daily grace: `5`
- initial backfill: `7`
- queue limit per profile: `50`

---

## 8. Failure And Recovery

If one profile fails during a sweep:

- record the error in scheduler state
- continue other profiles
- retry on the next tick

The scheduler must not require manual repair for normal transient failures.

Manual rebuild remains available for operator control:

- `bun run reflection:report:rebuild-daily --last-days 3`
- `POST /v1/reflection/reports/rebuild-daily?lastDays=3`

---

## 9. Observability

At minimum the scheduler should expose:

- logs on scheduler start
- logs per sweep when work is performed
- per-profile scheduler state in the database
- an HTTP status surface for the active profile

Useful fields:

- `lastDailyLocalDate`
- `lastSweepAt`
- `lastSuccessAt`
- `lastErrorAt`
- `lastError`

Current status route:

- `GET /v1/reflection/reports/scheduler`

This route should return:

- effective scheduler config
- current profile scheduler state

This is enough for V1 operator diagnosis.

---

## 10. Non-goals

V1 scheduler does not try to provide:

- distributed leader election
- multi-server coordination
- second-level cron precision
- external workflow engines
- historical full backfill by default

If we later need multi-instance deployment, the next step would be a lease or leader-election layer.
