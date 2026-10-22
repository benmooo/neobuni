---
title: "Schedule Reminder Delivery V1"
---

# Schedule Reminder Delivery V1

> Status: Active design
> Date: 2026-05-29
> Companion docs:
>
> - [../../ARCHITECTURE.md](../../ARCHITECTURE.md)
> - [./tool-runtime-v1.md](./tool-runtime-v1.md)
> - [./schedule-cron-recurrence-v1.md](./schedule-cron-recurrence-v1.md)
> - [../platform/feishu-db-backed-config.md](../platform/feishu-db-backed-config.md)
> - [../perception-layer/reflection-report-scheduler.md](../perception-layer/reflection-report-scheduler.md)

## 1. Purpose

This document defines the first real reminder-delivery runtime for `schedules`.

It answers one practical question:

**after `create_reminder` writes a schedule row, how does Buni actually notice that it is due and deliver the reminder?**

This document covers:

- the due-sweep runner
- chat and Feishu delivery
- idempotency and retry behavior
- one-shot completion behavior
- data-model changes
- observability

---

## 2. Core Decision

Reminder delivery should use **one small server-internal periodic sweep**, separate from the reflection report scheduler but built in the same style:

- functional core for due selection and delivery planning
- imperative shell for timers, DB writes, and network I/O

The active runtime model becomes:

```text
server process
  -> schedule due sweep tick
  -> find active due schedules
  -> claim each schedule run idempotently
  -> deliver reminder to chat and/or Feishu
  -> mark delivered
  -> if one-shot reminder, mark completed
```

This means:

- `create_reminder` stays a persistence tool
- delivery happens out-of-band in server runtime
- reminder delivery is durable across restarts
- downtime catch-up happens automatically

We intentionally do **not** add in V1:

- a dedicated worker service
- a dedicated reminder delivery table
- a distributed lock/claim layer

---

## 3. Scope

V1 delivery scope is:

- `status = active`
- `triggerAt != null`
- one-shot schedules created by `create_reminder`
- cron-backed schedules whose next due run is already materialized in `triggerAt`

V1 explicitly does **not** try to execute:

- arbitrary monitors without a concrete delivery handler
- second-level in-memory cron jobs

Recurring planning and rescheduling rules are defined in
`schedule-cron-recurrence-v1.md`.

---

## 4. Data Model

## 4.1 Top-level schedule fields

Add two nullable timestamp fields on `schedules`:

- `lastTriggeredAt`
- `deliveredAt`

Semantics:

- `lastTriggeredAt`
  means the due runner has claimed this reminder for delivery for its current one-shot trigger window
- `deliveredAt`
  means all delivery channels selected for this reminder run have completed successfully

For one-shot reminders:

- before trigger:
  - `status = active`
  - `lastTriggeredAt = null`
  - `deliveredAt = null`
- after successful delivery:
  - `status = completed`
  - `lastTriggeredAt = <claim time>`
  - `deliveredAt = <success time>`

## 4.2 Metadata delivery state

We keep per-channel progress inside `metadata` instead of creating a new table in V1.

Recommended metadata shape:

```ts
{
  source: "chat_tool" | "api" | "...",
  conversationId?: string,
  localDisplay?: string,
  delivery?: {
    chat?: {
      messageId?: string,
      deliveredAt?: string,
    },
    feishu?: {
      targetAlias?: string | null,
      receiveIdType?: string,
      receiveId?: string,
      messageId?: string | null,
      deliveredAt?: string,
    },
  },
}
```

This gives enough channel-level idempotency to survive:

- crash after chat delivery but before Feishu delivery
- crash after Feishu delivery but before final schedule update
- partial retries without duplicating already-written chat messages

Top-level timestamps remain the operator-facing state; metadata holds edge details.

---

## 5. Delivery Policy

## 5.1 Chat delivery

Chat delivery is available when reminder metadata contains a usable `conversationId`.

The runner writes one assistant-side event message into that conversation:

- role: `assistant`
- kind: `event`
- content: reminder text

This is treated as the reminder appearing in the Buni chat thread.

## 5.2 Feishu delivery

Feishu delivery is attempted when a target can be resolved by existing Feishu rules:

1. explicit target stored in reminder metadata
2. otherwise, if exactly one enabled Feishu target exists for the profile, use it implicitly

If neither condition holds:

- Feishu delivery is skipped
- chat delivery may still succeed

## 5.3 Reminder text

V1 reminder content should stay simple and truthful:

- title
- body/content
- scheduled local display time

No LLM call is required to render reminder delivery.

---

## 6. Idempotency Model

The due runner must be safe under:

- repeated ticks
- overlapping ticks
- server restart during delivery
- partial channel success

## 6.1 Claim rule

A schedule is claimable when all are true:

- `status = active`
- `triggerAt != null`
- `triggerAt <= now`
- `deliveredAt = null`

For recurring schedules, `triggerAt` is the next materialized run time, not a
derived field that is recomputed during due selection.

When a worker claims the schedule, it sets:

- `lastTriggeredAt = now`

Claiming does **not** imply delivery success.

## 6.2 Retry rule

If:

- `lastTriggeredAt != null`
- `deliveredAt = null`

the schedule is considered **triggered but not fully delivered** and remains retryable.

Retries must use metadata channel state to avoid duplicate side effects:

- if chat delivery metadata already exists, do not write another chat message
- if Feishu delivery metadata already exists, do not send again

## 6.3 Completion rule

After every configured/eligible delivery channel succeeds:

- set `deliveredAt = now`
- if the schedule is one-shot, set `status = completed`
- if the schedule is recurring, compute and persist the next `triggerAt` and keep `status = active`

This is the only state transition that closes the reminder lifecycle in V1.

---

## 7. Due Sweep Runner

## 7.1 Tick loop

The server owns one periodic loop:

- default tick interval: every `30s`
- implementation lives inside the server process
- one tick sweeps all active profiles

This runner is separate from the reflection scheduler because:

- the workload and failure semantics are different
- reminder delivery includes user-visible side effects
- we want separate config and logs

## 7.2 Sweep order

For each profile:

1. list due schedules
2. sort by `triggerAt ASC`
3. process up to the configured per-profile limit
4. continue other profiles even if one schedule fails

## 7.3 Catch-up

After downtime:

- any reminder with `triggerAt <= now`
- `status = active`
- `deliveredAt = null`

is picked up on the next sweep.

This gives automatic catch-up without a separate backlog table.

---

## 8. Delivery Flow

For one due reminder:

```text
select due schedule
  -> claim by setting lastTriggeredAt if needed
  -> load current metadata delivery state
  -> deliver chat if eligible and not already delivered
  -> deliver Feishu if eligible and not already delivered
  -> persist metadata delivery details
  -> if all selected channels succeeded:
       set deliveredAt
       set status=completed
```

If one channel fails after another channel already succeeded:

- persist the successful channel state
- leave `deliveredAt = null`
- keep `status = active`
- retry only the missing channel on next sweep

---

## 9. Observability

At minimum the runner should emit:

- startup log with effective config
- per-tick summary log
- event rows for:
  - `schedule.triggered`
  - `schedule.delivery.chat`
  - `schedule.delivery.feishu`
  - `schedule.delivered`
  - `schedule.delivery_failed`
  - `schedule.completed`

This keeps delivery history on existing `events` infrastructure rather than a new delivery table.

---

## 10. Configuration

Recommended env knobs:

- `BUNI_SCHEDULE_DUE_RUNNER_ENABLED`
- `BUNI_SCHEDULE_DUE_RUNNER_TICK_MS`
- `BUNI_SCHEDULE_DUE_RUNNER_LIMIT_PER_PROFILE`

Recommended defaults:

- enabled: `true`
- tick: `30000`
- per-profile limit: `20`

---

## 11. Implementation Shape

Implementation should follow:

- pure helpers for:
  - due eligibility
  - channel planning
  - completion decisions
- imperative shell for:
  - timer loop
  - DB reads/writes
  - chat message creation
  - Feishu network sends
  - event logging

Suggested server layout:

```text
apps/server/src/schedules/
  due-runner.ts
  due-runner.test.ts
  delivery.ts
  delivery.test.ts
  types.ts
```

Suggested repo additions:

- query due schedules
- update delivery metadata and timestamps
- claim triggered schedules safely

---

## 12. Non-Goals

V1 does not provide:

- recurring reminder execution
- per-channel backoff policy
- a distributed worker lock
- inbox push or websocket fan-out for reminder delivery
- user-configurable delivery routing UI

Those can come later if reminder volume or routing complexity justifies them.
