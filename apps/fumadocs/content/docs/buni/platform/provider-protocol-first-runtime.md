---
title: "Provider Protocol-First Runtime Reset"
---

# Provider Protocol-First Runtime Reset

> Status: Accepted design
> Date: 2026-05-25

## 1. Purpose

This document defines the reset of Buni's provider runtime boundary after the DeepSeek V4 thinking-mode failures exposed the wrong abstraction.

The core decision is simple:

- Buni will become protocol-first, not vendor-first.
- DeepSeek chat will stop using the OpenAI-compatible chat path.
- Old chat history and provider-private transcript compatibility will be dropped instead of patched further.

This is an aggressive reset on purpose. The project is early stage, and the existing compatibility path has already proven too fragile.

## 2. Problem

The current DeepSeek integration failed for structural reasons, not because of a missing patch:

1. DeepSeek V4 thinking mode over the OpenAI-compatible chat interface introduces provider-private round-trip requirements such as `reasoning_content`.
2. Tool calling makes that round-trip stricter: the provider expects prior assistant tool calls and tool results to be replayed exactly in provider-native form.
3. We responded by adding custom codecs, transcript persistence, legacy transcript replay, and edge-case patches.
4. The result is a runtime that is increasingly organized around a vendor quirk instead of a stable architecture boundary.

That is the wrong trade.

## 3. Design Decisions

### 3.1 Protocol first, not vendor first

Runtime transport selection must be based on protocol capability first.

The relevant protocol families are:

- `openai`
- `anthropic`

Vendor remains important, but vendor is now a thin overlay on top of protocol:

- `openai`
- `anthropic`
- `deepseek`
- `qwen`
- `mock`

The runtime should answer these two questions separately:

1. Which protocol adapter should execute this request?
2. Which vendor defaults, model guards, and option mappings apply?

### 3.2 DeepSeek chat uses the Anthropic protocol

For chat and tool-enabled reasoning, DeepSeek will use the Anthropic-compatible endpoint.

Why:

- DeepSeek officially supports the Anthropic wire format for thinking and tool use.
- `@tanstack/ai-anthropic` already provides the right transport semantics.
- This removes the need for custom `reasoning_content` replay logic and provider-private OpenAI chat codecs.

This is the new default:

- DeepSeek chat protocol: `anthropic`
- DeepSeek chat base URL: DeepSeek Anthropic endpoint

DeepSeek should only retain a thin wrapper that is allowed to:

- provide default base URLs
- validate model names
- inject vendor-specific option mappings
- reject unsupported combinations early

It must not own a custom transcript format or a custom stream protocol.

### 3.3 Thin vendor wrappers only

Vendor wrappers are allowed to translate configuration into protocol adapter options.

Vendor wrappers are not allowed to:

- reimplement the provider stream model
- invent provider-private persisted transcript formats
- accumulate protocol-specific replay logic in the runtime shell
- become a second adapter stack next to the official TanStack adapters

If a vendor needs heavy stream or transcript rewriting, that is a signal that the wrong protocol adapter was selected.

### 3.4 Provider-private transcript persistence is removed

The runtime should persist only histories that are useful at the product boundary.

Allowed persisted history:

- UI transcript
- canonical model transcript if we still need a non-UI runtime form

Disallowed persisted history:

- provider-private chat transcript required only to satisfy one vendor's replay contract
- legacy `providerTranscript`
- `metadata.transcript.provider` as a runtime dependency

The provider should be able to reconstruct the next request from a canonical conversation state, not from opaque provider-private artifacts.

### 3.5 History reset instead of compatibility

We will not carry the old DeepSeek transcript burden forward.

Migration posture:

- delete all existing chat messages
- delete all existing conversations
- delete runtime turns and spans tied to those conversations
- start fresh with the new provider protocol architecture

This is preferable to maintaining compatibility code for already-bad transcript history.

### 3.6 Capability-oriented config model

The config model must explicitly separate capability, vendor, and protocol.

Current provider configuration is too vendor-shaped and too implicit. The replacement should move toward a transport profile like this:

```ts
type ProviderCapability = "chat" | "memory_embedding" | "memory_reasoning";

type ProviderProtocol = "openai" | "anthropic";

type ProviderVendor = "mock" | "openai" | "anthropic" | "deepseek" | "qwen";

type ProviderProfile = {
  capability: ProviderCapability;
  protocol: ProviderProtocol;
  vendor: ProviderVendor;
  model: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  modelOptions: Record<string, unknown>;
  metadata: Record<string, unknown>;
};
```

Key consequence:

- `provider` can no longer silently imply both vendor and protocol.

### 3.7 Settings must become capability-driven

The settings UI is currently too tied to vendor-specific hardcoded sections.

The provider settings redesign should follow the same architecture:

- group by capability first
- show protocol explicitly
- derive vendor-specific defaults from schema-driven definitions
- stop hardcoding DeepSeek as "OpenAI-compatible"

This is also the cleanest path to making the settings page modular instead of ever-growing.

## 4. Runtime Boundary After Reset

The target runtime shape is:

```text
Persisted conversation state
  -> canonical transcript builder
  -> protocol adapter selection
  -> thin vendor wrapper
  -> TanStack official adapter
  -> stream / tool runtime
  -> UI transcript persistence
  -> runtime observability
```

The main correction is:

- transcript is a product artifact
- protocol is an execution artifact

Those two concerns should not be persisted in the same shape.

## 5. Migration Plan

### Phase 1

- Introduce `@tanstack/ai-anthropic`
- Move DeepSeek chat to the Anthropic adapter
- Remove the custom DeepSeek OpenAI-compatible chat adapter path

### Phase 2

- Stop writing provider transcript metadata
- Remove provider transcript replay from runtime chat history assembly
- Keep only the canonical transcript form required by the product

### Phase 3

- Redesign provider config around `capability + protocol + vendor`
- Update the settings UI to render capability-oriented provider sections

### Phase 4

- Delete all existing chat history
- Delete the legacy compatibility code and tests
- Remove docs that still describe DeepSeek chat as OpenAI-compatible

## 6. Explicitly Obsolete Assumptions

The following assumptions are now obsolete:

- "DeepSeek chat should use the OpenAI-compatible chat path."
- "Provider-private transcript replay is an acceptable long-term runtime dependency."
- "A custom OpenAI-compatible DeepSeek adapter is a reasonable permanent abstraction."
- "Backward-compatible continuation of old chats is worth the complexity."

## 7. Affected Documentation

This document supersedes transport-level assumptions in:

- `docs/memory-system/memories-implementation.md`
- any settings copy or architecture note that describes DeepSeek chat as OpenAI-compatible

`ARCHITECTURE.md` remains the high-level source of truth. This document is the focused execution note for the provider/runtime reset.
