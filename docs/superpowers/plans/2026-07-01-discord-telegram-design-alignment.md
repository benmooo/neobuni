---
title: "Discord / Telegram Design Alignment Implementation Plan"
---

# Discord / Telegram Design Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the highest-value gaps between the approved Discord / Telegram personal messaging design and the current implementation, prioritizing runtime safety and storage truth before broader Discord ingress expansion.

**Architecture:** Keep the existing messaging runtime split across `contracts -> db -> server integrations/runtime/tools`, but tighten it in three places: make `chat_public_safe` influence the live chat prompt instead of only storage/tool filtering, move the messaging dedupe/binding guarantees into the real Drizzle schema rather than only test DDL, and then extend Discord ingress from slash-command-only toward mention / reply handling on top of the same hidden-conversation binding flow.

**Tech Stack:** TypeScript, Bun test runner, Drizzle ORM, Hono, TanStack AI runtime, existing Buni messaging repos and public-safe surface policy

---

## File Structure

### Runtime safety

- Create: `apps/server/src/runtime/surface-prompt.ts`
- Create: `apps/server/src/runtime/surface-prompt.test.ts`
- Modify: `apps/server/src/runtime/create-chat-turn-stream.ts`

### Messaging schema truth

- Create: `packages/db/src/schema/messaging-schema.test.ts`
- Modify: `packages/db/src/schema/messaging-integrations.ts`
- Modify: `packages/db/src/schema/messaging-targets.ts`
- Modify: `packages/db/src/schema/external-conversation-bindings.ts`
- Modify: `packages/db/src/schema/external-event-receipts.ts`

### Discord ingress follow-up

- Modify: `apps/server/src/routes/integrations-discord.ts`
- Modify: `apps/server/src/routes/integrations-discord.test.ts`
- Create: `apps/server/src/integrations/discord-gateway.ts`
- Create: `apps/server/src/integrations/discord-gateway.test.ts`
- Modify: `apps/server/src/index.ts`

## Task 1: Make `chat_public_safe` Affect the Live Prompt

**Files:**

- Create: `apps/server/src/runtime/surface-prompt.test.ts`
- Create: `apps/server/src/runtime/surface-prompt.ts`
- Modify: `apps/server/src/runtime/create-chat-turn-stream.ts`

- [ ] **Step 1: Write the failing prompt helper test**

```ts
test("adds a group-safe instruction for chat_public_safe prompts", () => {
  const result = applySurfacePromptPolicy({
    promptPacket: {
      systemPrompt: "Base prompt",
      sections: [
        {
          key: "identity",
          title: "Identity",
          body: "You are Buni.",
        },
      ],
      compiledExpression: null,
    },
    surfacePolicy: getSurfacePolicy("chat_public_safe"),
  });

  expect(result.systemPrompt).toContain("group-safe public surface");
  expect(result.systemPrompt).toContain("Do not rely on private autobiographical context");
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `bun test apps/server/src/runtime/surface-prompt.test.ts`
Expected: FAIL because `surface-prompt.ts` does not exist yet.

- [ ] **Step 3: Implement the minimal helper**

```ts
const applySurfacePromptPolicy = (input: {
  promptPacket: ProviderPromptPacket;
  surfacePolicy: SurfacePolicy;
}): ProviderPromptPacket => {
  if (input.surfacePolicy.responseVisibility !== "group") {
    return input.promptPacket;
  }

  return {
    ...input.promptPacket,
    systemPrompt: [
      input.promptPacket.systemPrompt,
      "Response visibility: group-safe public surface.",
      "Do not rely on private autobiographical context that is not visible in this conversation.",
    ].join("\n"),
  };
};
```

- [ ] **Step 4: Wire the helper into live chat execution**

```ts
const promptPacket = applySurfacePromptPolicy({
  promptPacket: kernelResult.promptPacket,
  surfacePolicy: effectiveSurfacePolicy,
});
```

- [ ] **Step 5: Run the focused runtime tests**

Run: `bun test apps/server/src/runtime/surface-prompt.test.ts apps/server/src/runtime/run-external-message-turn.test.ts apps/server/src/runtime/surface-policy.test.ts`
Expected: PASS

## Task 2: Move Messaging Uniqueness into the Real Schema

**Files:**

- Create: `packages/db/src/schema/messaging-schema.test.ts`
- Modify: `packages/db/src/schema/messaging-integrations.ts`
- Modify: `packages/db/src/schema/messaging-targets.ts`
- Modify: `packages/db/src/schema/external-conversation-bindings.ts`
- Modify: `packages/db/src/schema/external-event-receipts.ts`

- [ ] **Step 1: Write the failing schema index test**

```ts
test("external messaging tables declare the required unique indexes", () => {
  expect(readIndexes(messagingIntegrationsTable)).toContainEqual({
    name: "messaging_integrations_profile_platform_idx",
    unique: true,
    columns: ["profile_id", "platform"],
  });
  expect(readIndexes(messagingTargetsTable)).toContainEqual({
    name: "messaging_targets_profile_platform_alias_idx",
    unique: true,
    columns: ["profile_id", "platform", "alias"],
  });
  expect(readIndexes(externalConversationBindingsTable)).toContainEqual({
    name: "external_conversation_bindings_scope_idx",
    unique: true,
    columns: ["profile_id", "platform", "scope_type", "scope_key"],
  });
  expect(readIndexes(externalEventReceiptsTable)).toContainEqual({
    name: "external_event_receipts_event_idx",
    unique: true,
    columns: ["profile_id", "platform", "event_id"],
  });
});
```

- [ ] **Step 2: Run the focused schema test to verify it fails**

Run: `bun test packages/db/src/schema/messaging-schema.test.ts`
Expected: FAIL because the schema files currently declare no indexes for these tables.

- [ ] **Step 3: Add the missing unique indexes to the Drizzle table definitions**

```ts
const externalEventReceiptsTable = sqliteTable(
  "external_event_receipts",
  {/* columns */},
  (table) => [
    uniqueIndex("external_event_receipts_event_idx").on(
      table.profileId,
      table.platform,
      table.eventId,
    ),
  ],
);
```

- [ ] **Step 4: Re-run the schema test**

Run: `bun test packages/db/src/schema/messaging-schema.test.ts`
Expected: PASS

## Task 3: Extend Discord Beyond Slash Commands

**Files:**

- Create: `apps/server/src/integrations/discord-gateway.test.ts`
- Create: `apps/server/src/integrations/discord-gateway.ts`
- Modify: `apps/server/src/routes/integrations-discord.ts`
- Modify: `apps/server/src/routes/integrations-discord.test.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Write a failing normalization test for mention / reply events**

```ts
test("normalizes a Discord MESSAGE_CREATE mention into an external prompt", () => {
  const event = normalizeDiscordGatewayMessage({
    applicationId: "discord_app_123",
    event: mentionMessageFixture,
  });

  expect(event).toEqual({
    platform: "discord",
    scopeType: "guild_channel",
    scopeKey: "guild-1:channel-1",
    eventId: "message-1",
    latestUserText: "整理今天 AI 热点",
  });
});
```

- [ ] **Step 2: Run the focused Discord gateway tests to verify they fail**

Run: `bun test apps/server/src/integrations/discord-gateway.test.ts apps/server/src/routes/integrations-discord.test.ts`
Expected: FAIL because no gateway adapter or mention/reply normalization exists yet.

- [ ] **Step 3: Implement the minimal Discord gateway worker and reuse the existing public-safe runtime flow**

```ts
const handled = await handleDiscordGatewayMessage({
  profileId: integration.profileId,
  applicationId: integration.appId,
  event,
  ensureConversationBinding,
  runExternalMessageTurn,
  sendDiscordMessage,
});
```

- [ ] **Step 4: Start the gateway worker on server boot when Discord messaging is configured**

Run: `bun test apps/server/src/integrations/discord-gateway.test.ts apps/server/src/routes/integrations-discord.test.ts`
Expected: PASS

## Task 4: Verify the Alignment Tranche

**Files:**

- No new files

- [ ] **Step 1: Run focused tests**

Run: `bun test apps/server/src/runtime/surface-prompt.test.ts apps/server/src/runtime/run-external-message-turn.test.ts apps/server/src/runtime/surface-policy.test.ts packages/db/src/schema/messaging-schema.test.ts packages/db/src/repos/messaging-config.integration.test.ts apps/server/src/routes/integrations-discord.test.ts`
Expected: PASS

- [ ] **Step 2: Run relevant typechecks**

Run: `bun run typecheck:contracts && bun run typecheck:db && bun run typecheck:server`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-07-01-discord-telegram-design-alignment.md \
  apps/server/src/runtime/surface-prompt.ts \
  apps/server/src/runtime/surface-prompt.test.ts \
  apps/server/src/runtime/create-chat-turn-stream.ts \
  packages/db/src/schema/messaging-schema.test.ts \
  packages/db/src/schema/messaging-integrations.ts \
  packages/db/src/schema/messaging-targets.ts \
  packages/db/src/schema/external-conversation-bindings.ts \
  packages/db/src/schema/external-event-receipts.ts \
  apps/server/src/integrations/discord-gateway.ts \
  apps/server/src/integrations/discord-gateway.test.ts \
  apps/server/src/routes/integrations-discord.ts \
  apps/server/src/routes/integrations-discord.test.ts \
  apps/server/src/index.ts
git commit -m "feat: align messaging runtime with approved public-safe design"
```
