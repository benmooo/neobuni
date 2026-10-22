---
title: "Assistant UI Chat Migration"
---

# Assistant UI Chat Migration

> Status: Implemented
> Date: 2026-05-27
> Owner: Codex

## 1. Goal

Replace the current custom mobile chat rendering shell with assistant-ui while keeping the existing TanStack AI runtime and the current Streamdown markdown rendering behavior.

This migration has two explicit constraints:

- markdown stays on the existing Streamdown-based renderer
- thinking and tool blocks move to assistant-ui primitives instead of custom blocks

The result should be:

- TanStack AI remains the transport/runtime source of truth
- assistant-ui owns the thread/composer/message shell
- Buni keeps runtime metadata injection and conversation persistence
- the old custom chat rendering shell is removed

## 2. Current State

The current mobile chat surface is split across these files:

- `apps/mobile/src/hooks/use-persistent-chat.ts`
- `apps/mobile/src/routes/_app/chat/$conversationId.tsx`
- `apps/mobile/src/components/chat/MessageList.tsx`
- `apps/mobile/src/components/chat/MessageBubble.tsx`
- `apps/mobile/src/components/chat/AssistantMessageParts.tsx`
- `apps/mobile/src/components/chat/ChatInput.tsx`
- `apps/mobile/src/components/chat/ThinkingBlock.tsx`
- `apps/mobile/src/components/chat/ToolCallBlock.tsx`
- `apps/mobile/src/components/chat/ToolResultBlock.tsx`
- `apps/mobile/src/components/chat/AssistantMarkdown.tsx`

The existing architecture already has a clean runtime boundary:

- `usePersistentChat()` owns `useChat()` from `@tanstack/ai-react`
- persisted assistant transcript metadata is expanded into hydrated UI messages
- runtime renderer state is polled from spans and injected back into the latest assistant message metadata

The main problem is no longer transport correctness. The problem is UI shell ownership:

- message shell is hand-rolled
- composer shell is hand-rolled
- slash/mention/add-file extension points are not aligned to a reusable runtime
- thinking/tool rendering exists as custom blocks instead of first-class assistant-ui primitives

## 3. Target State

After migration, the chat stack should look like this:

```text
TanStack AI useChat / SSE transport
  -> usePersistentChat
  -> assistant-ui external-store runtime adapter
  -> local assistant-ui Thread component
     -> assistant-ui ThreadPrimitive
     -> assistant-ui ComposerPrimitive
     -> assistant-ui MessagePrimitive / ChainOfThoughtPrimitive
     -> existing AssistantMarkdown for text parts
```

This is intentionally not a full runtime replacement.

We are **not** switching to `@assistant-ui/react-ai-sdk`.

We are **not** changing `/v1/chat/stream`.

We are **not** changing the existing transcript persistence model.

## 4. Official Assistant UI Constraints

The migration follows the current assistant-ui docs in two areas:

### 4.1 Thread component posture

assistant-ui's Thread UI is a local component added to the app and built from:

- `ThreadPrimitive.Root`
- `ThreadPrimitive.Viewport`
- `ThreadPrimitive.Messages`
- `ThreadPrimitive.ViewportFooter`
- composer primitives

This means Buni should own a local `components/assistant-ui/thread.tsx` implementation rather than waiting for a monolithic npm-exported `Thread` widget.

### 4.2 Streamdown integration posture

assistant-ui documents Streamdown as the markdown path for rich streaming markdown and calls out these operational constraints:

- Tailwind v4 needs `@source` entries for `streamdown` and installed plugins
- the streaming caret depends on those scanned classes
- optional animation keyframes require importing `streamdown/styles.css`

Buni already satisfies the CSS scanning requirement in `apps/mobile/src/styles.css`.

Because the repo already has a tuned `AssistantMarkdown` wrapper around `streamdown`, the migration will reuse that wrapper instead of switching to `@assistant-ui/react-streamdown`.

This keeps:

- math plugin setup
- mermaid plugin setup
- existing link safety logic
- existing streaming animation state rules

## 5. Migration Design

## 5.1 Runtime ownership

Keep `usePersistentChat()` as the single source of truth for:

- messages
- send
- stop
- loading state
- active assistant activity state
- runtime metadata backfill via `setMessages`

Add a pure assistant-ui adapter layer on top:

- `convertUiMessageToThreadMessageLike(message)`
- `useAssistantUiChatRuntime({ messages, send, stop, isLoading, ... })`

This adapter will use `useExternalStoreRuntime()`.

## 5.2 Message conversion boundary

TanStack AI and assistant-ui use different message-part shapes.

The conversion rules must be explicit and pure.

### Buni UIMessage parts

- `text`
- `thinking`
- `tool-call`
- `tool-result`

### Assistant UI target parts

- `text`
- `reasoning`
- `tool-call`

The most important conversion rule:

- `tool-result` must be merged back into the corresponding assistant-ui `tool-call`

assistant-ui expects tool result state to live on the tool-call part itself, not as a sibling result part.

### Required mapping

- `text.content` -> `text.text`
- `thinking.content` -> `reasoning.text`
- `tool-call.name` -> `tool-call.toolName`
- `tool-call.id` -> `tool-call.toolCallId`
- `tool-call.input/arguments` -> `tool-call.args`
- `tool-call` + matching `tool-result` -> one assistant-ui tool-call part with `result` / `isError`

### Metadata handling

Keep Buni-specific render metadata on `metadata.custom.render` when converting.

Do not try to teach assistant-ui about Buni `RendererState` directly.

## 5.3 UI shell ownership

The old UI shell will be replaced by a new local assistant-ui component tree:

- `apps/mobile/src/components/assistant-ui/thread.tsx`
- `apps/mobile/src/components/assistant-ui/message.tsx`
- `apps/mobile/src/components/assistant-ui/composer.tsx`
- `apps/mobile/src/components/assistant-ui/streamdown-text.tsx`
- `apps/mobile/src/components/assistant-ui/tool-ui.tsx`

The route page should still own:

- `ChatHeader`
- `RenameDialog`
- runtime span polling and metadata reinjection
- new conversation creation

The assistant-ui Thread should own:

- empty state
- viewport
- messages
- scroll-to-bottom affordance
- composer shell
- send/cancel switching

## 5.4 Markdown rendering

Text parts in assistant messages should render through the existing:

- `apps/mobile/src/components/chat/AssistantMarkdown.tsx`

We will not preserve the old `AssistantMessageParts` wrapper, but we will preserve the markdown component itself.

That means:

- existing Streamdown config remains authoritative
- code/math/mermaid behavior remains stable
- no regressions from switching markdown libraries during the same migration

## 5.5 Thinking rendering

The old `ThinkingBlock.tsx` will be removed from the main message flow.

assistant-ui reasoning should render through:

- `ChainOfThoughtPrimitive.Root`
- `ChainOfThoughtPrimitive.AccordionTrigger`
- `ChainOfThoughtPrimitive.Parts`

This gives a proper assistant-ui-native reasoning UI instead of a custom block bolted onto the message renderer.

The Buni-specific behavior we still need:

- hidden by default
- clear Chinese labeling
- compatible with streaming

## 5.6 Tool rendering

The old `ToolCallBlock.tsx` and `ToolResultBlock.tsx` will be removed from the main message flow.

assistant-ui tool rendering should become the canonical path.

The local tool UI layer should still keep Buni-specific display choices:

- Chinese labels
- structured JSON input/output preview
- clear status treatment for waiting / running / complete / error

But the source of truth becomes assistant-ui tool parts, not TanStack sibling result parts.

## 5.7 Composer rendering

The old `ChatInput.tsx` will be replaced by assistant-ui composer primitives.

The new composer must still preserve Buni runtime-driven behaviors:

- `composerPlaceholder`
- alert banner from `UiRenderSpec`
- suggested actions above the input

The new composer should be structured so slash/mention/add-file can land later without redesigning the input again.

## 6. Files To Add

- `apps/mobile/src/components/assistant-ui/thread.tsx`
- `apps/mobile/src/components/assistant-ui/message.tsx`
- `apps/mobile/src/components/assistant-ui/composer.tsx`
- `apps/mobile/src/components/assistant-ui/streamdown-text.tsx`
- `apps/mobile/src/components/assistant-ui/tool-ui.tsx`
- `apps/mobile/src/components/assistant-ui/runtime-provider.tsx`
- `apps/mobile/src/lib/assistant-ui/convert-ui-message-to-thread-message-like.ts`

## 7. Files To Change

- `apps/mobile/package.json`
- `apps/mobile/src/routes/_app/chat/$conversationId.tsx`
- `apps/mobile/src/styles.css`
- `CHANGELOG.md`
- `ARCHITECTURE.md`

## 8. Files Expected To Become Dead

These should become removable after the migration lands cleanly:

- `apps/mobile/src/components/chat/MessageList.tsx`
- `apps/mobile/src/components/chat/MessageBubble.tsx`
- `apps/mobile/src/components/chat/AssistantMessageParts.tsx`
- `apps/mobile/src/components/chat/ChatInput.tsx`
- `apps/mobile/src/components/chat/ThinkingBlock.tsx`
- `apps/mobile/src/components/chat/ToolCallBlock.tsx`
- `apps/mobile/src/components/chat/ToolResultBlock.tsx`
- `apps/mobile/src/components/chat/TypingIndicator.tsx`
- `apps/mobile/src/components/chat/AssistantActivityCard.tsx`
- `apps/mobile/src/components/chat/activity-model.ts`
- `apps/mobile/src/components/chat/chat-display-preferences.tsx`

Some of these may be deleted immediately. Others may remain temporarily if runtime pages still import them.

## 9. Execution Order

1. Add this migration document.
2. Add the assistant-ui runtime adapter.
3. Add local assistant-ui Thread/message/composer components.
4. Swap the chat route to render the assistant-ui Thread.
5. Remove the old message/composer shell from the route.
6. Delete dead custom shell components.
7. Typecheck the mobile app.

## 10. Verification Checklist

The migration is only complete when all of the following are true:

- chat route renders through assistant-ui Thread primitives
- send still works through TanStack AI
- stop/cancel still works
- persisted messages still hydrate correctly
- runtime `render` metadata still updates the latest assistant message
- text markdown still renders through the existing Streamdown wrapper
- thinking renders through assistant-ui reasoning primitives
- tool calls/results render through assistant-ui tool UI
- empty state still works
- composer placeholder still respects `UiRenderSpec`
- suggested actions still render and send prompts
- mobile typecheck passes

## 11. Explicit Non-Goals

This migration does not yet implement:

- slash commands
- `@` mention
- add file / attachments
- thread list / assistant-ui sidebar
- message editing / reload / branch switching

The new shell should leave room for those, but this migration does not need to ship them.
