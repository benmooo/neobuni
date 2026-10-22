---
title: "Expression Renderer Contract V1"
---

# Expression Renderer Contract V1

> Status: Active implementation
> Date: 2026-05-02
> Companion docs: [`./expression-compiler-contract-v1.md`](./expression-compiler-contract-v1.md), [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)

## 1. Purpose

This document defines the next boundary after expression compilation.

Compilers answer:

- how the turn should sound
- how the turn should be framed

Renderers answer:

- what concrete UI affordances should appear
- what concrete voice playback parameters should be used

The renderer contract should consume compiled plans, not raw soul state.

## 2. Boundary

The V1 dataflow is:

```text
ResponseSpec
  + ExpressionContext
  + SignalDrivers
  -> CompiledExpressionSet
  -> RendererState
```

`RendererState` is the first renderer-facing output surface.

## 3. Voice Renderer Contract

V1 voice renderer output is `VoiceRenderSpec`.

It carries:

- `stylePreset`
- `speakingRate`
- `pauseMs`
- `boundaryMode`
- `repairPreface`

This is not yet wired to a TTS engine, but it is now stable enough to persist as assistant-message metadata and later feed a speech pipeline directly.

## 4. UI Renderer Contract

V1 UI renderer output is `UiRenderSpec`.

It carries:

- `bubbleVariant`
- `alertTone`
- `alertTitle`
- `alertBody`
- `composerPlaceholder`
- `suggestedActions`

This output is consumed by mobile chat UI now.

Current V1 usage:

- assistant bubble variant
- composer placeholder
- support/protective alert block above composer
- suggested follow-up action chips

## 5. Persistence Rule

Assistant messages should persist `RendererState` under message metadata.

This makes renderer output:

- inspectable after the turn finishes
- reusable by clients without re-running kernel logic
- decoupled from runtime observability spans

## 6. Provider Shell Relationship

Text rendering still goes through a provider prompt path.

That path should now be:

```text
CompiledExpressionSet
  -> ProviderPromptPacket
  -> buildProviderChatOptions(...)
  -> chat(...)
```

`buildProviderChatOptions(...)` is the shell adapter that translates internal prompt-packet state into provider SDK options.

This keeps:

- kernel contracts stable
- provider SDK shaping localized
- provider-specific expansion points out of `create-chat-turn-stream.ts`

## 7. Done When

V1 is done when:

1. renderer-facing schemas exist in contracts
2. core builds `RendererState` from compiled expressions
3. assistant messages persist renderer state
4. mobile chat UI consumes `UiRenderSpec`
5. provider shell uses `buildProviderChatOptions(...)`
