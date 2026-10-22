---
title: "Buni Schedule Runtime Dataflow V1"
---

# Buni Schedule Runtime Dataflow V1

> Status: implemented
> Date: 2026-05-30
> Companion docs:
> - [./schedule-cron-recurrence-v1.md](./schedule-cron-recurrence-v1.md)
> - [./schedule-reminder-delivery-v1.md](./schedule-reminder-delivery-v1.md)
> - [./news-tools-v1.md](./news-tools-v1.md)

## Purpose

This document explains the real end-to-end schedule dataflow in Buni:

- how a user message becomes a tool call
- how the model supplies `cronExpr`
- how a schedule row is persisted
- how the due runner finds due work
- how delivery is actually executed

## Reality Check

The current runtime does **not** use a separate `task` table for schedule
execution.

The implemented chain is:

1. tool call writes or updates a row in `schedules`
2. recurring schedules persist their next due time in `triggerAt`
3. `startScheduleDueRunner()` starts a periodic in-process sweep
4. `runScheduleDueSweep()` queries the `schedules` table directly
5. `deliverDueSchedule()` performs side effects directly
6. after a recurring delivery succeeds, Buni computes and persists the next `triggerAt`

So the durable execution queue is the `schedules` table itself, not a derived
task queue.

## General End-to-End Flow

```mermaid
flowchart TD
  U["User message<br/>Example: 'schedule news brief every 5 hours and send it to Feishu'"]

  subgraph RT["Chat Runtime"]
    A["app.fetch / runtime entry"]
    B["createChatTurnStream()"]
    C["createChatToolSet(context)"]
    D["tool definitions exposed to model<br/>name + description + input schema"]
    E["chat(...tools)"]
  end

  subgraph LLM["Model Reasoning"]
    F["LLM reads tool schema"]
    G["LLM chooses schedule_news_brief"]
    H["LLM constructs tool args<br/>{ briefId, cronExpr, timezone?, feishuTargetAlias? }"]
  end

  subgraph TOOL["Tool Execution"]
    I["scheduleNewsBriefInputSchema.parse(args)"]
    J["getNewsBriefById(briefId)"]
    K["planNewsBriefSchedule(...)"]
    L["planScheduleCreateInput(...)"]
    M["validateCronSchedule(...)"]
    N["getNextCronTriggerAt(...)"]
    O["createSchedule(profileId, planned)"]
    P["appendEvent('schedule.created', ...)"]
  end

  subgraph DB1["Durable State"]
    Q[("schedules table<br/>id, type, title, content,<br/>triggerAt, cronExpr, timezone,<br/>status, metadataJson, deliveredAt")]
    R[("events table")]
  end

  subgraph STARTUP["Server Startup"]
    S["index.ts"]
    T["startScheduleDueRunner()"]
    V["setInterval(tickMs)"]
  end

  subgraph SWEEP["Periodic Due Sweep"]
    W["runScheduleDueSweep(nowIso, config)"]
    X["listActiveProfiles()"]
    Y["listDueSchedules(profileId, nowIso, limit)"]
    Z["for each due schedule -> deliverDueSchedule(...)"]
  end

  subgraph EXEC["Delivery Execution"]
    AA["buildReminderDeliveryPlan(...)"]
    AB["buildScheduleMessageText(...)"]
    AC["If monitor/news brief:<br/>getNewsBrief(...) now"]
    AD["If chat eligible:<br/>createMessage(conversationId, event message)"]
    AE["If Feishu eligible:<br/>sendFeishuMessage(profileId, payload)"]
    AF["appendEvent(schedule.triggered / delivery.* / delivered / failed)"]
    AG["If one-shot:<br/>updateSchedule(status='completed', deliveredAt=now)"]
    AH["If recurring:<br/>getNextCronTriggerAt(...)"]
    AI["updateSchedule(triggerAt=next, deliveredAt=now, metadata.localDisplay=nextLocalDisplay)"]
    AJ["appendEvent('schedule.rescheduled', ...)"]
  end

  U --> A --> B --> C --> D --> E
  E --> F --> G --> H
  H --> I --> J --> K --> L
  L --> M --> N --> O
  O --> Q
  O --> P --> R

  S --> T --> V --> W
  W --> X --> Y
  Y --> Q
  Y --> Z --> AA --> AB
  AB --> AC
  AC --> AD
  AC --> AE
  AD --> AF
  AE --> AF

  AF --> AG
  AF --> AH --> AI --> Q
  AI --> AJ --> R
  AG --> Q
  AG --> R
```

**Explanation**

- The model is not handed a hidden scheduler DSL. It sees the tool schema and must supply `cronExpr` explicitly.
- The schedule tool does not enqueue a separate job row. It writes a durable row into `schedules`.
- The server starts one periodic due runner on boot. That runner queries `schedules` directly.
- Actual side effects happen inside `deliverDueSchedule()`: chat message creation, Feishu send, event append, and recurring re-arming.
- For recurring schedules, execution and rescheduling are one loop: `deliver current run -> compute next triggerAt -> persist back to schedules`.

## Specific Flow: `schedule_news_brief`

```mermaid
flowchart TD
  U["User says:<br/>'schedule news brief every 5 hours and send it to Feishu'"]

  subgraph CHAT["Chat Turn"]
    A["createChatTurnStream()"]
    B["createChatToolSet(context)"]
    C["Tool available:<br/>schedule_news_brief(briefId, cronExpr, timezone?, ...)"]
    D["LLM decides tool is relevant"]
    E["LLM emits tool call<br/>Example cronExpr: 0 */5 * * *"]
  end

  subgraph TOOL["schedule_news_brief"]
    F["scheduleNewsBriefInputSchema.parse(args)"]
    G["getNewsBriefById('ai' | 'tech' | 'china')"]
    H["Resolve timezone<br/>input.timezone ?? profileTimezone ?? clientTimezone ?? defaultTimezone"]
    I["planNewsBriefSchedule(...)"]
    J["planScheduleCreateInput(...)"]
    K["validateCronSchedule(cronExpr, timezone)"]
    L["getNextCronTriggerAt(after = referenceNow)"]
    M["createSchedule(profileId, { type:'monitor', cronExpr, triggerAt:next, metadata.kind:'news_brief_monitor', ... })"]
    N["appendEvent('schedule.created', ...)"]
  end

  subgraph DB["Database"]
    O[("schedules row<br/>type=monitor<br/>metadata.kind='news_brief_monitor'<br/>provider='newsnow'")]
  end

  subgraph RUNNER["Periodic Execution"]
    P["startScheduleDueRunner() on server startup"]
    Q["runScheduleDueSweep() every tick"]
    R["listDueSchedules() finds row where<br/>status='active' and triggerAt <= now"]
    S["deliverDueSchedule(schedule)"]
  end

  subgraph DELIVERY["News Brief Delivery"]
    T["isNewsBriefSchedule(schedule)"]
    U2["buildScheduleMessageText(...)"]
    V["getNewsBrief({ briefId, countPerSource, maxItems })<br/>fetch current headlines at run time"]
    W["buildNewsBriefMessageText(...)"]
    X["sendFeishuMessage(...) and/or createMessage(...)"]
    Y["getNextCronTriggerAt(after = nowIso)"]
    Z["updateSchedule(triggerAt = next, deliveredAt = now, metadata.localDisplay = nextLocalDisplay)"]
  end

  U --> A --> B --> C --> D --> E
  E --> F --> G --> H --> I --> J --> K --> L --> M --> N --> O

  P --> Q --> R --> O
  R --> S --> T --> U2 --> V --> W --> X --> Y --> Z --> O
```

**Explanation**

- In this specific tool, the LLM must generate `cronExpr` itself from the user intent. Buni does not currently translate a higher-level recurrence object at this boundary.
- The stored row contains only the durable scheduling truth needed for execution: `triggerAt`, `cronExpr`, `timezone`, delivery metadata, and the brief configuration.
- At execution time, Buni does **not** send a cached news payload. It fetches the current brief again with `getNewsBrief(...)`, then renders and delivers that run's headlines.
- After a successful recurring run, the same schedule row is advanced to the next `triggerAt`.

## Function Map

- Chat runtime entry: `apps/server/src/runtime/create-chat-turn-stream.ts`
- Tool registration: `apps/server/src/tools/tool-sets.ts`
- Schedule tool contract: `packages/contracts/src/execution-layer/schedule-news-brief.ts`
- Schedule tool implementation: `apps/server/src/tools/schedule-news-brief.ts`
- Core schedule planning: `apps/server/src/schedules/plan-schedule.ts`
- Cron calculation: `apps/server/src/schedules/recurrence.ts`
- Due runner startup and sweep: `apps/server/src/schedules/due-runner.ts`
- Delivery execution: `apps/server/src/schedules/delivery.ts`
- Schedule persistence: `packages/db/src/repos/schedules.ts`
- Server startup wiring: `apps/server/src/index.ts`
