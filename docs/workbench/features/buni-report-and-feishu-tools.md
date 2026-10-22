---
title: "Buni Reflection Report And Feishu Tools"
---

# Buni Reflection Report And Feishu Tools

## Goal

Expose a chat-callable reflection report surface whose tool names match what they actually do, and keep Feishu delivery explicitly compositional.

## Current Shape

The report-to-Feishu path is explicitly composed from separate steps:

1. `create_reflection_report`, `get_reflection_report`, or `update_reflection_report`
2. `render_reflection_report_to_feishu_message`
3. `send_feishu_message`

Supporting tools stay orthogonal:

- `list_reflection_reports`
- `delete_reflection_report`
- `list_feishu_targets`
- `list_feishu_delivery_logs`

Removed from the surface:

- the legacy reflection operator surface
- `generate_reflection_report`
- `preview_feishu_message`
- `send_reflection_report_to_feishu`

## Why This Design

### 1. CRUD names are clearer than mixed "resolve" semantics

Reflection reports are now treated as persisted artifacts.

Each tool has one clear responsibility:

- `create_reflection_report`: create a report artifact for a requested window
- `get_reflection_report`: fetch one persisted report by id
- `list_reflection_reports`: browse persisted reports across a requested window
- `update_reflection_report`: regenerate an existing report or an exact existing window
- `delete_reflection_report`: remove one persisted report

This avoids old mixed contracts where one tool could search, reuse, build, or return empty results depending on internal branching.

### 2. One shared target model keeps time selection legible

Reflection report tools converge on one discriminated `target` object:

- `{ kind: "day", localDate }`
- `{ kind: "week", weekOfDate }`
- `{ kind: "month", monthOfDate }`
- `{ kind: "range", startDate, endDate }`

This is easier for the model than mixing `period`, `mode`, `localDate`, `startDate`, and `endDate` with partially overlapping meanings.

### 3. Render is pure, send is effectful

`render_reflection_report_to_feishu_message` is a pure formatting step:

- input: a persisted reflection report artifact
- output: a Feishu interactive card payload plus plain-text fallback
- no network I/O
- no report creation or regeneration

`send_feishu_message` is the transport edge:

- accepts either text or card payloads
- resolves target alias or explicit receive id
- sends through the configured Feishu app

This keeps side effects isolated and keeps delivery composable.

### 4. Canonical and range reports are both persisted artifacts

Canonical reports:

- `daily`
- `weekly`
- `monthly`

continue to align with the scheduled reflection pipeline.

Range reports:

- arbitrary `startDate + endDate`

are also persisted now, but they stay distinct from canonical scheduling semantics.

## Tool Contracts

## 1. `create_reflection_report`

Intent:

- create a reflection report artifact for one requested target window

Inputs:

- `target`
- optional `language`

Behavior:

- canonical targets create `daily`, `weekly`, or `monthly` artifacts
- range targets create `range` artifacts
- output is the persisted report artifact, not a transient resolution wrapper

## 2. `get_reflection_report`

Intent:

- fetch one persisted report by `reportId`

Behavior:

- never creates
- never regenerates
- fails if the report does not exist for the current profile

## 3. `list_reflection_reports`

Intent:

- browse persisted reports scoped by period and optional target window

Behavior:

- never creates
- never regenerates
- daily listings over a week or month window expand across the whole resolved window

## 4. `update_reflection_report`

Intent:

- regenerate an existing report artifact

Inputs:

- `reportId`
- optional override `target`
- optional `language`

Behavior:

- if the exact window already exists, the artifact keeps the same `reportId`
- this is the tool that justifies assistant language like "regenerated"

## 5. `delete_reflection_report`

Intent:

- delete one persisted report artifact by `reportId`

Behavior:

- removes the artifact only
- does not affect source observations or delivery logs

## 6. `render_reflection_report_to_feishu_message`

Intent:

- convert a persisted reflection report into a Feishu-ready interactive card

Output includes:

- `message.type = "card"`
- `message.card`
- `message.fallbackText`
- `message.previewText`
- compact report metadata

## 7. `send_feishu_message`

Intent:

- send a typed outbound Feishu message

Supported payloads:

- `{ type: "text", text }`
- `{ type: "card", card, fallbackText }`

Targeting:

- `targetAlias`
- or explicit `receiveIdType + receiveId`

## 8. `list_feishu_targets`

Intent:

- inspect configured alias targets independently of send credentials

## 9. `list_feishu_delivery_logs`

Intent:

- inspect historical Feishu deliveries derived from event logs

## Assistant Semantics

The assistant must describe only what actually happened:

- do not say "created" unless `create_reflection_report` ran
- do not say "regenerated" unless `update_reflection_report` ran
- do not say "fetched" when a tool created a new artifact
- do not say "sent to Feishu" when only `render_reflection_report_to_feishu_message` ran

## Non-Goals

- no compatibility layer to preserve old reflection operator names
- no composite report-resolution helper that also searches or rebuilds
- no report-specific send helper
- no dedicated Feishu delivery table in this pass
