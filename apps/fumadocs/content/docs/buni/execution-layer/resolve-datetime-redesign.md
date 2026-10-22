---
title: "Buni Resolve Datetime Redesign"
---

# Buni Resolve Datetime Redesign

> Version: 1.0
> Date: 2026-04-29

---

## 0. Purpose

This document defines the redesign of Buni's `resolve_datetime` tool after the first V1 implementation exposed a key weakness:

- the tool protocol is correct
- the resolution boundary is correct
- but the parser implementation is too weak and too eager to declare ambiguity

The redesign keeps the public tool contract stable while replacing the internals with a more reliable layered resolver.

---

## 1. Problem Statement

The first implementation of `resolve_datetime` used a small handwritten heuristic parser.

That implementation was acceptable as a placeholder, but it has three structural problems:

1. coverage is too narrow
2. malformed-but-understandable expressions fail too early
3. resolver internals are mixed with protocol concerns

A concrete failure example is:

```text
tomorrow afternoon at 14:00 pm
```

This expression is not truly ambiguous.

It is syntactically messy, but semantically clear:

- `tomorrow`
- `afternoon`
- `14:00`

The old resolver rejected it because the parser only accepted `1..12 + am/pm`, so `14:00 pm` was treated as an invalid clock time, and the whole expression was escalated to `resolved=false`.

That behavior is too brittle.

---

## 2. Design Summary

The new internal architecture is:

```text
resolve_datetime(sourceText)
  -> time_context(referenceNow, timezone)
  -> normalization
  -> chrono-node parse
  -> if unresolved: fallback reasoning -> structured datetime intent
  -> deterministic datetime assembly
  -> resolved artifact
```

The public contract remains:

- the chat model calls `resolve_datetime`
- the chat model receives a `resolutionId`
- `create_reminder` requires that `resolutionId`

The redesign only changes how `resolve_datetime` arrives at its result.

---

## 3. Core Decisions

### 3.1 Keep `resolve_datetime` as the public tool

The chat model should not be required to manually orchestrate:

- a current-time tool
- a date-math tool
- a normalization step

That is too low-level for the main chat model and would create avoidable multi-step tool chains.

Instead:

- `resolve_datetime` remains the only public datetime-resolution tool for the chat model
- internal sub-steps stay inside the server-side resolver

### 3.2 `time_context` is internal

The resolver must always operate with:

- `referenceNow`
- resolved timezone

These values are server-owned inputs, not model-generated inputs.

Therefore the "current time" capability exists, but it is treated as internal resolver context rather than a public chat tool.

### 3.3 Prefer deterministic parsing first

The resolver should prefer deterministic parsing before using an LLM fallback.

The main parser should be `chrono-node`, not a handwritten regex parser.

Reason:

- broader natural-language coverage
- built-in support for `ParsingReference`
- less custom parsing logic to maintain

### 3.4 LLM fallback must return structured data

When deterministic parsing fails, the fallback should not directly output the final ISO datetime.

Instead it should return a structured intermediate representation such as:

```json
{
  "kind": "relative_day_with_time",
  "dayOffset": 1,
  "hour": 14,
  "minute": 0
}
```

Then server-side deterministic code converts that structured result into the final absolute datetime.

This keeps the LLM responsible for interpretation, not final timestamp authority.

---

## 4. Public Contract

The public tool contract does not change.

### Input

```ts
type ResolveDatetimeInput = {
  sourceText: string;
};
```

### Output

```ts
type ResolveDatetimeOutput = {
  resolutionId: string;
  resolved: boolean;
  sourceText: string;
  timezone: string;
  resolutionSource: "absolute" | "chrono" | "fallback" | "unresolved";
  referenceNow: string;
  resolvedAt: string | null;
  localDisplay: string | null;
  isAmbiguous: boolean;
  reasoning?: string;
};
```

`resolutionSource` is observability metadata.

It exists so runtime timeline can show which layer produced the final answer:

- `absolute`
- `chrono`
- `fallback`
- `unresolved`

### Constraint

`create_reminder` still requires a valid `resolutionId` from the same turn.

No direct raw `triggerAt` guessing is allowed.

---

## 5. Internal Resolver Architecture

## 5.1 Step 1: time context

The resolver first determines:

- `referenceNow`
- `timezone`

Timezone priority remains:

1. `profile.timezone`
2. client explicit timezone
3. server default timezone

This step is deterministic and server-owned.

## 5.2 Step 2: normalization

Before parsing, the resolver should normalize obviously malformed expressions.

Examples:

- `14:00 pm` -> `14:00`
- duplicate whitespace removal
- punctuation cleanup
- common mixed-format clock normalization

Normalization should be conservative:

- clean formatting issues
- do not invent missing semantics

## 5.3 Step 3: `chrono-node`

The primary parser should be `chrono-node`.

Use it with:

- normalized source text
- `ParsingReference.instant = referenceNow`
- `ParsingReference.timezone = resolved timezone`
- `forwardDate = true` for reminder-style future scheduling

Expected role:

- parse common natural-language time expressions
- resolve relative dates using the supplied reference instant
- return a deterministic result whenever it can

## 5.4 Step 4: fallback reasoning

If `chrono-node` fails or returns insufficient precision, the resolver may call an internal reasoning model.

This is not a public tool call by the main chat model.

The fallback model must return structured JSON, not prose.

Example output:

```json
{
  "kind": "relative_day_with_time",
  "dayOffset": 1,
  "hour": 14,
  "minute": 0
}
```

Other possible shapes may include:

```json
{
  "kind": "relative_duration",
  "minutesOffset": 120
}
```

```json
{
  "kind": "absolute_local_datetime",
  "year": 2026,
  "month": 4,
  "day": 29,
  "hour": 14,
  "minute": 0
}
```

## 5.5 Step 5: deterministic assembly

The structured fallback result is then converted to:

- absolute UTC datetime
- local display string
- final resolved artifact

This step must be deterministic and server-owned.

The LLM is not allowed to directly declare the final ISO timestamp as the authority.

---

## 6. Ambiguity Rules

The redesign distinguishes two very different failure classes.

### 6.1 Invalid formatting but recoverable

Examples:

- `14:00 pm`
- duplicated words
- inconsistent casing

These should not be treated as truly ambiguous.

The resolver should:

- normalize first
- then parse
- then fallback if needed

### 6.2 Semantically underspecified

Examples:

- `tomorrow afternoon`
- `next week sometime`
- `later`

These are genuinely underspecified.

The resolver should return:

- `resolved=false`
- `isAmbiguous=true`

and the chat model should ask a clarifying question instead of creating a reminder.

---

## 7. Why Not Expose `get_current_time` and `date_math` as Public Tools

These capabilities may still exist internally, but they should not be the main chat-model-facing API.

Reason:

- more tool calls per user request
- more brittle multi-step orchestration
- more prompt burden on the main model
- less stable behavior across providers/models

The better abstraction is:

- public: `resolve_datetime`
- internal: `time_context`, normalization, `chrono-node`, fallback reasoning, deterministic assembly

This keeps the public tool set small and the server behavior more controlled.

---

## 8. Observability Implications

The external runtime span shape remains:

- `tool_call(resolve_datetime)`

No new public stage is required for V1.5.

However the `tool_call` output should reflect the final decision more clearly:

- `resolved`
- `resolvedAt`
- `localDisplay`
- `isAmbiguous`
- `reasoning`

If internal fallback reasoning occurs, it may optionally be included in the tool result metadata later, but that is not required in this redesign.

One important UI correction is required:

- the runtime timeline summary must read `tool_call.output.result.*`
- not only top-level `tool_call.output.*`

Otherwise the semantic summary can incorrectly show `---` even when the raw result exists.

---

## 9. Implementation Plan

Recommended order:

1. add `chrono-node` to server dependencies
2. replace handwritten parser as the primary resolver path
3. add normalization utilities for malformed but understandable time expressions
4. add internal fallback reasoning that returns structured JSON
5. add deterministic assembly from structured fallback output
6. update runtime timeline summary to read nested `tool_call.result`
7. verify with mixed-format cases such as:
   - `tomorrow afternoon at 14:00 pm`
   - `in 2 hours`
   - `tomorrow at 11 am`
   - `tomorrow afternoon`

---

## 10. Acceptance Criteria

The redesign is complete when:

- `resolve_datetime` no longer depends primarily on handwritten clock parsing
- `chrono-node` is the primary deterministic parser
- malformed-but-clear input like `14:00 pm` no longer fails immediately
- fallback reasoning returns structured JSON, not prose
- deterministic code still owns final timestamp assembly
- ambiguous expressions still fail safely
- runtime timeline correctly displays resolved tool results
