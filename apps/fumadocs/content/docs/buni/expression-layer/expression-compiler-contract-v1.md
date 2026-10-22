---
title: "Expression Compiler Contract V1"
---

# Expression Compiler Contract V1

> Status: Active implementation
> Date: 2026-05-02
> Companion docs: [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md), [`../runtime-kernel-implementation-plan.md`](../runtime-kernel-implementation-plan.md), [`./expression-renderer-contract-v1.md`](./expression-renderer-contract-v1.md)

## 1. Purpose

This document defines the first compiler boundary for Buni's expression layer.

The goal is not to fully implement text, voice, and UI expression. The goal is to stop treating `ResponseSpec` as something that only becomes meaningful once it is embedded into prompt text.

V1 should establish:

- `ResponseSpec` as policy, not rendering
- channel-specific compiler contracts
- one shared compiler input context
- compiled output for text, voice, and UI without duplicating soul policy
- a prompt packet boundary between prompt compilation and provider request shaping

## 2. Current Problem

Current runtime behavior:

- soul builds `ResponseSpec`
- prompt compiler still renders expressive policy directly into system prompt text

This means `ResponseSpec` exists, but it is still too close to prompt serialization.

## 3. Design Rule

Expression should follow the same architecture rule as perception:

- soul produces policy
- compilers transform policy into channel-specific plans
- renderers or prompts consume compiled plans

Compilers should be pure.

## 4. Contract Layers

### 4.1 `ResponseSpec`

`ResponseSpec` remains the cross-channel policy object.

It answers:

- what the reply is trying to do
- what stance it should take
- what tone and boundaries apply
- whether follow-up or suggestion is allowed
- how willing the turn is to use tools

### 4.2 Expression compiler input

Compilers should also receive bounded runtime context:

- `ResponseSpec`
- working-memory focus
- soul appraisal summary
- protective level
- top signal drivers

This context should be small and stable.

### 4.3 Compiled expression output

Each channel compiler returns a channel-specific plan.

Implemented V1 outputs:

- text compiler => opening mode, body mode, follow-up mode, suggestion mode
- voice compiler => cadence, affect, pause density, repair mode
- UI compiler => message framing, CTA mode, card density, alert style

## 5. Compiled Expression Set

V1 now compiles one `CompiledExpressionSet` from one `ResponseSpec + ExpressionContext + signalDrivers` input.

### 5.1 Text plan

The text compiler outputs:

- `openingMode`
- `bodyMode`
- `closingMode`
- `followupMode`
- `suggestionMode`
- `toolUseMode`
- `toneDirectives`
- `forbiddenMoves`
- `renderHints`

This output is not a prompt by itself. It is a structured text-expression plan.

### 5.2 Voice plan

The voice compiler outputs:

- `cadenceMode`
- `affectMode`
- `pauseDensity`
- `emphasisBudget`
- `repairMode`
- `toneDirectives`
- `forbiddenMoves`
- `renderHints`

### 5.3 UI plan

The UI compiler outputs:

- `messageFrame`
- `ctaMode`
- `cardDensity`
- `alertStyle`
- `composerMode`
- `toneDirectives`
- `forbiddenMoves`
- `renderHints`

## 6. Prompt Packet Relationship

In V1:

- prompt compiler still exists
- prompt compiler consumes `CompiledExpressionSet.text`
- prompt compiler emits a structured `ProviderPromptPacket`
- provider request shaping consumes `ProviderPromptPacket`, not a bare prompt string contract

`ProviderPromptPacket` should include:

- final `systemPrompt`
- prompt sections
- attached compiled expression set

This is the transition step that lets us keep current provider behavior while separating policy from rendering.

The next downstream step is `CompiledExpressionSet -> RendererState`, documented in [`./expression-renderer-contract-v1.md`](./expression-renderer-contract-v1.md).

## 7. Future Channels

Voice and UI renderers are not implemented yet, but their compilers now exist.

That means the runtime contract now includes:

- expression channel enum
- compiler input schemas
- compiled text / voice / UI schemas
- compiled expression set schema
- provider prompt packet schema

Renderers can remain future work after the compiler contract proves out.

## 8. Observability Rule

`response_spec_build` spans should expose:

- raw `ResponseSpec`
- compiled expression input context
- top expression-driving signals
- compiled expression set

This makes expression planning inspectable before any future voice or UI renderers exist.

`working_memory_build` and `soul_decision` should also expose the same top signal drivers when those signals materially shaped constraints, action candidates, appraisal, or protective stance.

`prompt_compile` spans should expose:

- prompt section count
- prompt section summaries
- compiled expression channels attached to the prompt packet

Mobile runtime UI should prefer concise summaries over raw JSON dumps:

- working-memory focus + top constraints + top action candidates
- appraisal + protective reasons + signal drivers
- response policy + compiled text / voice / UI modes
- prompt packet sections before provider dispatch

## 9. Done When

V1 is done when:

1. runtime contracts define an expression compiler boundary
2. `packages/core` includes pure text / voice / UI compilers
3. prompt compilation consumes compiled expression output through a prompt packet
4. provider request shaping consumes the prompt packet rather than a bare prompt string input
5. runtime observability shows both `ResponseSpec` and the compiled expression set
6. top signal drivers remain inspectable across working memory, soul decision, and response spec stages
