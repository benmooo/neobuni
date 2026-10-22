---
title: "Discord Public-Safe Runtime Reply Implementation Plan"
---

# Discord Public-Safe Runtime Reply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Discord `/buni` interactions into a hidden conversation binding, execute a `chat_public_safe` agent turn, and return the assistant text back to Discord as the interaction reply.

**Architecture:** Reuse the existing chat runtime path instead of building a second orchestration stack. Make `createChatTurnStream(...)` surface-aware, add a small `runExternalMessageTurn(...)` wrapper that consumes the stream non-interactively, and update the Discord route to resolve `scopeKey -> conversation binding -> runtime -> reply`.

**Tech Stack:** TypeScript, Bun test runner, Hono, TanStack AI chat runtime, existing Buni runtime observer and SQLite repos

---

## File Structure

### Runtime

- Create: `apps/server/src/runtime/run-external-message-turn.ts`
- Create: `apps/server/src/runtime/run-external-message-turn.test.ts`
- Modify: `apps/server/src/runtime/create-chat-turn-stream.ts`

### Discord route

- Modify: `apps/server/src/routes/integrations-discord.ts`
- Modify: `apps/server/src/routes/integrations-discord.test.ts`

### Messaging repo

- Modify: `packages/db/src/repos/messaging-config.ts`

## Task 1: Add Failing Runtime and Route Tests

**Files:**

- Create: `apps/server/src/runtime/run-external-message-turn.test.ts`
- Modify: `apps/server/src/routes/integrations-discord.test.ts`

- [ ] **Step 1: Write the failing runtime test**

```ts
test("runExternalMessageTurn consumes the chat stream with chat_public_safe", async () => {
  const result = await runExternalMessageTurn(
    {
      profileId: "profile-1",
      conversationId: "conversation-1",
      latestUserText: "整理今天 AI 热点",
      platform: "discord",
      externalThreadId: "interaction-1",
    },
    {
      createChatTurnStream: createChatTurnStreamMock,
    },
  );

  expect(createChatTurnStreamMock.mock.calls[0]?.[0].surfacePolicy?.surface).toBe(
    "chat_public_safe",
  );
  expect(result.assistantText).toBe("今天的 AI 热点如下");
});
```

- [ ] **Step 2: Extend the Discord route test**

```ts
expect(createConversationMock).toHaveBeenCalledTimes(1);
expect(createExternalConversationBindingMock).toHaveBeenCalledWith({
  profileId: "profile-1",
  platform: "discord",
  scopeType: "guild_channel",
  scopeKey: "guild-1:channel-1",
  conversationId: "conversation-new",
});
expect(runExternalMessageTurnMock).toHaveBeenCalledWith({
  profileId: "profile-1",
  conversationId: "conversation-new",
  latestUserText: "整理今天 AI 热点",
  platform: "discord",
  externalThreadId: "interaction-1",
});
```

- [ ] **Step 3: Run the focused tests to verify they fail**

Run: `bun test apps/server/src/runtime/run-external-message-turn.test.ts apps/server/src/routes/integrations-discord.test.ts`
Expected: FAIL because `run-external-message-turn.ts` does not exist and the route does not yet create bindings or execute the runtime.

## Task 2: Implement the Public-Safe External Turn Wrapper

**Files:**

- Create: `apps/server/src/runtime/run-external-message-turn.ts`
- Create: `apps/server/src/runtime/run-external-message-turn.test.ts`
- Modify: `apps/server/src/runtime/create-chat-turn-stream.ts`

- [ ] **Step 1: Add `surfacePolicy` support to `createChatTurnStream(...)`**

```ts
type ChatTurnStreamInput = {
  // existing fields...
  surfacePolicy?: SurfacePolicy | null;
};
```

- [ ] **Step 2: Load context and toolset through the provided surface**

```ts
const effectiveSurfacePolicy = input.surfacePolicy ?? getSurfacePolicy("chat_private");
const loadedContext = await loadTurnContext({
  // existing fields...
  surfacePolicy: effectiveSurfacePolicy,
});

const serverTools = effectiveSurfacePolicy.surface === "chat_private"
  ? createChatToolSet(...)
  : createExecutionTools(...);
```

- [ ] **Step 3: Create `runExternalMessageTurn(...)`**

```ts
const runExternalMessageTurn = async (input, deps = defaultDeps) => {
  const abortController = new AbortController();
  let assistantText = "";

  const stream = await deps.createChatTurnStream({
    profileId: input.profileId,
    conversationId: input.conversationId,
    threadId: input.externalThreadId,
    abortController,
    clientTimezone: input.clientTimezone ?? null,
    latestUserText: input.latestUserText,
    clientTools: [],
    surfacePolicy: getSurfacePolicy("chat_public_safe"),
  });

  for await (const chunk of stream) {
    if (chunk.type === "TEXT_MESSAGE_CONTENT" && chunk.delta) {
      assistantText += chunk.delta;
    }
  }

  return {
    assistantText: assistantText.trim(),
  };
};
```

- [ ] **Step 4: Run the runtime test**

Run: `bun test apps/server/src/runtime/run-external-message-turn.test.ts`
Expected: PASS

## Task 3: Wire Discord Slash Commands to ScopeKey, Binding, Runtime, and Reply

**Files:**

- Modify: `apps/server/src/routes/integrations-discord.ts`
- Modify: `apps/server/src/routes/integrations-discord.test.ts`
- Modify: `packages/db/src/repos/messaging-config.ts`

- [ ] **Step 1: Add a `getOrCreate`-style binding flow inside the route**

```ts
const scopeKey = `${interaction.guild_id ?? "dm"}:${interaction.channel_id}`;
const existingBinding = await deps.getExternalConversationBinding({
  profileId: integration.profileId,
  platform: "discord",
  scopeType: "guild_channel",
  scopeKey,
});

const conversationId =
  existingBinding?.conversationId ??
  (
    await deps.createConversation(integration.profileId, {
      title: `[discord] ${scopeKey}`,
      modelKey: "default",
    })
  ).id;
```

- [ ] **Step 2: Extract slash command text and execute the runtime**

```ts
const latestUserText = readDiscordSlashCommandText(interaction);
const runtimeResult = await deps.runExternalMessageTurn({
  profileId: integration.profileId,
  conversationId,
  latestUserText,
  platform: "discord",
  externalThreadId: interaction.id,
});
```

- [ ] **Step 3: Return the runtime text as the Discord interaction reply**

```ts
return c.json(
  {
    type: 4,
    data: {
      content: runtimeResult.assistantText,
    },
  },
  200,
);
```

- [ ] **Step 4: Run the Discord route test**

Run: `bun test apps/server/src/routes/integrations-discord.test.ts`
Expected: PASS

## Task 4: Verify the Tranche

**Files:**

- No new files

- [ ] **Step 1: Run focused tests**

Run: `bun test apps/server/src/runtime/run-external-message-turn.test.ts apps/server/src/routes/integrations-discord.test.ts apps/server/src/integrations/discord.test.ts apps/server/src/tools/channel-tools.test.ts apps/server/src/tools/tool-sets.test.ts`
Expected: PASS

- [ ] **Step 2: Run relevant typechecks**

Run: `bun run typecheck:server && bun run typecheck:db`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/runtime/run-external-message-turn.ts \
  apps/server/src/runtime/run-external-message-turn.test.ts \
  apps/server/src/runtime/create-chat-turn-stream.ts \
  apps/server/src/routes/integrations-discord.ts \
  apps/server/src/routes/integrations-discord.test.ts \
  packages/db/src/repos/messaging-config.ts \
  docs/superpowers/plans/2026-06-15-discord-public-safe-runtime-reply.md
git commit -m "feat: wire discord slash commands into public-safe runtime"
```
