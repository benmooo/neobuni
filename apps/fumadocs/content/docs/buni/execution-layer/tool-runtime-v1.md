---
title: "Buni V1 Tool Runtime Plan"
---

# Buni V1 Tool Runtime Plan

> Version: 1.0
> Date: 2026-04-28

---

## 0. Purpose

This document defines the V1 plan for two related changes in Buni's tool runtime:

1. Introduce a dedicated `resolve_datetime` tool before `create_reminder`
2. Restructure tool definitions and server handlers into explicit modules and tool sets

The immediate trigger is a concrete failure mode in the current system:

- the model can call `create_reminder`
- the model currently guesses `triggerAt`
- guessed ISO datetimes can be wrong
- `create_reminder` is currently a stub and does not persist to `schedules`

V1 fixes the protocol first, then the implementation.

---

## 1. Design Summary

The V1 design is:

```text
model intent
  -> resolve_datetime(sourceText)
  -> create_reminder(title, content, resolutionId)
  -> server validates resolutionId in the same turn
  -> server persists schedule
```

Key decisions:

- `resolve_datetime` is mandatory before `create_reminder` when the time expression is relative or natural language
- `create_reminder` must require `resolutionId`
- `create_reminder` must not accept model-guessed ISO datetimes as its primary protocol
- timezone resolution is server-owned
- ambiguous datetime resolution must not create a reminder
- tool definitions and tool handlers are split into dedicated modules
- chat tools are assembled from explicit tool sets instead of a single flat file

---

## 2. Problem Statement

The current shape has three issues.

### 2.1 Datetime guessing is unsafe

Today `create_reminder` expects:

```ts
{
  title: string;
  content: string;
  triggerAt: string; // ISO datetime
}
```

That design pushes the model to invent an absolute datetime from phrases like:

- `tomorrow morning at 11 am`
- `next Friday after lunch`
- `remind me in two hours`

The model cannot reliably infer the correct absolute timestamp unless it has the right `now`, timezone, and parsing rules.

### 2.2 Tool protocol is underspecified

The current protocol lets the model skip the resolution step entirely and jump straight into a mutation tool. That creates two classes of bugs:

- incorrect reminder time
- inconsistent tool behavior across models/providers

### 2.3 Tool code structure does not scale

Today:

- tool definitions live in one contracts file
- server handlers live in one server file
- tool injection is a flat array

That is workable for a prototype, but it is a poor base for:

- tool sets
- scenario-based enablement
- feature flags
- permission gating
- better testing boundaries

---

## 3. Goals and Non-goals

### 3.1 Goals

V1 must provide:

- a deterministic datetime resolution step
- a strict protocol between `resolve_datetime` and `create_reminder`
- turn-scoped validation of resolved datetime artifacts
- a modular tool definition and handler layout
- runtime observability for both tools

### 3.2 Non-goals

V1 does not attempt to do:

- recurring reminders or cron planning
- a generic workflow engine for all tools
- long-lived persistence for resolved datetime artifacts outside the turn
- perfect multilingual temporal parsing for all edge cases

---

## 4. Protocol Design

## 4.1 `resolve_datetime`

`resolve_datetime` is a read-like tool. It does not mutate any user data.

The model should call it when the user expresses time in relative, natural-language, or context-dependent form.

Examples:

- `tomorrow morning at 11 am`
- `in two hours`
- `next Wednesday at lunch`
- `this evening`

### Input

```ts
type ResolveDatetimeInput = {
  sourceText: string;
};
```

The model only supplies the original time expression or the minimum span needed to resolve it.

The server supplies the execution context:

- `referenceNow`
- resolved timezone
- turn id

### Output

```ts
type ResolveDatetimeOutput = {
  resolutionId: string;
  resolved: boolean;
  sourceText: string;
  timezone: string;
  referenceNow: string;
  resolvedAt: string | null;
  localDisplay: string | null;
  isAmbiguous: boolean;
  reasoning?: string;
};
```

Constraints:

- `resolutionId` is always returned
- if `resolved=false`, then `resolvedAt` must be `null`
- if `isAmbiguous=true`, the caller must not proceed to `create_reminder`

### Timezone priority

V1 timezone priority is:

1. `profile.timezone`
2. client explicit timezone
3. server default timezone

If `sourceText` itself contains an explicit timezone signal, the resolver may use it as a parsing hint, but the server still owns the final normalization rules.

## 4.2 `create_reminder`

`create_reminder` is a mutation tool. It persists a row in `schedules`.

### Input

```ts
type CreateReminderInput = {
  title: string;
  content: string;
  resolutionId: string;
};
```

### Output

```ts
type CreateReminderOutput = {
  scheduleId: string;
  created: boolean;
  triggerAt: string;
  timezone: string;
  localDisplay: string;
  note?: string;
};
```

### Validation rules

The server must validate:

- `resolutionId` exists
- `resolutionId` was created in the same turn
- the resolution is `resolved=true`
- the resolution is not ambiguous

If any validation fails, `create_reminder` must fail instead of guessing a datetime.

---

## 5. Turn-scoped Resolution Artifact

The strong constraint in V1 is not just "the model should call `resolve_datetime` first".
It is "the mutation tool must prove that resolution already happened in this turn".

V1 uses a turn-scoped resolution artifact:

```ts
type ResolvedDatetimeArtifact = {
  id: string;
  turnId: string;
  sourceText: string;
  timezone: string;
  referenceNow: string;
  resolvedAt: string | null;
  localDisplay: string | null;
  resolved: boolean;
  isAmbiguous: boolean;
};
```

Recommended V1 implementation:

- keep artifacts in an in-memory map scoped to the active chat turn
- record the resolved output in the `tool_call` span for observability
- do not introduce a new database table in V1

This keeps the protocol strict without expanding persistence scope too early.

---

## 6. Failure and Fallback Behavior

Tool failure must not necessarily fail the whole turn.

This matches the existing runtime policy:

- tool execution may fail
- the model may continue and recover
- the final turn may still complete successfully

### `resolve_datetime` failure modes

- parsing failed
- expression is ambiguous
- timezone context missing or invalid
- resolver internal error

Expected model behavior after failure:

- ask a clarifying question
- avoid creating the reminder

### `create_reminder` failure modes

- missing `resolutionId`
- unknown `resolutionId`
- `resolutionId` belongs to another turn
- resolution is ambiguous or unresolved
- database persistence failed

Expected model behavior after failure:

- explain that the reminder was not created
- ask the user to clarify if needed

---

## 7. Modular Tool Layout

## 7.1 Contracts layer

Keep tool contracts in the execution-layer surface as per-tool modules.

Recommended layout:

```text
packages/contracts/src/execution-layer/
  create-reminder.ts
  resolve-datetime.ts
  recall-memory.ts
  tools.ts
```

Responsibilities:

- tool name
- description
- input schema
- output schema

No server-side execution logic belongs here.

## 7.2 Server layer

Keep server tool handlers in their own top-level `tools/` surface.

Recommended layout:

```text
apps/server/src/tools/
  create-reminder.ts
  resolve-datetime.ts
  recall-memory.ts
  tool-sets.ts
  types.ts
  index.ts
```

Responsibilities:

- bind tool definitions to server handlers
- inject runtime dependencies
- validate turn-scoped artifacts
- assemble tool sets for chat/runtime use

## 7.3 Tool set assembly

V1 should assemble chat tools compositionally from the shipped server-owned tool surfaces:

```ts
createMemoryTools(ctx)
createExecutionTools(ctx)

createChatToolSet(ctx) =>
  [
    ...createMemoryTools(ctx),
    ...createExecutionTools(ctx),
  ]
```

This gives a clean base for future:

- feature gating
- profile-specific tool access
- provider-specific tool enablement
- mode-specific tool sets

---

## 8. Runtime Observability Impact

No new span type is required for V1.

Both tools continue to appear as `tool_call` spans.

Expected timeline shape for a successful reminder flow:

```text
request_received
user_message_persist
retrieval_signals
temporal_recall
soul_runtime
prompt_build
provider_stream
tool_call(resolve_datetime)
tool_call(create_reminder)
assistant_message_persist
turn_finalize
```

Recommended `tool_call` span payload for `resolve_datetime`:

- `sourceText`
- `referenceNow`
- `timezone`

Recommended `tool_call` span output for `resolve_datetime`:

- `resolutionId`
- `resolved`
- `resolvedAt`
- `localDisplay`
- `isAmbiguous`

Recommended `tool_call` span output for `create_reminder`:

- `scheduleId`
- `triggerAt`
- `timezone`
- `localDisplay`

This is sufficient for V1 developer timeline debugging.

---

## 9. Implementation Sequence

Recommended order:

1. Split contracts tool definitions into per-tool modules
2. Add `resolve_datetime` definition
3. Split server handlers into per-tool modules and tool sets
4. Implement turn-scoped datetime artifact store
5. Implement `resolve_datetime` handler
6. Change `create_reminder` protocol to require `resolutionId`
7. Replace reminder stub with real `schedules` persistence
8. Update runtime timeline UI summary formatting for new tool outputs
9. Add tests for happy path, ambiguity, and invalid resolution id

---

## 10. Acceptance Criteria

V1 is complete when all of the following are true:

- the model can no longer create reminders by inventing raw ISO timestamps
- reminder creation requires a valid turn-scoped `resolutionId`
- a successful reminder tool call inserts a row into `schedules`
- ambiguous time expressions do not create reminders
- runtime timeline clearly shows both datetime resolution and reminder creation
- tool code is split into modular definitions and tool sets
