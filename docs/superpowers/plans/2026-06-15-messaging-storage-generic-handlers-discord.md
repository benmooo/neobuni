---
title: "Messaging Storage + Generic Handlers + Discord Adapter Implementation Plan"
---

# Messaging Storage + Generic Handlers + Discord Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add generic messaging storage and channel delivery handlers, then ship a first Discord adapter that supports config persistence, outbound text delivery, and verified interaction ingress.

**Architecture:** Keep Feishu and QQ on their current storage model, add new generic messaging tables for Discord and Telegram-era surfaces, and aggregate them behind `list_channel_targets` / `send_channel_message`. Discord Phase 1 for this tranche verifies interaction signatures, answers `PING`, dedupes incoming interaction IDs, and returns a safe placeholder response for `/buni` while outbound delivery is fully wired.

**Tech Stack:** TypeScript, Bun test runner, Zod, Hono, Drizzle ORM with SQLite, existing Buni tool/runtime contracts

---

## File Structure

### Contracts

- Create: `packages/contracts/src/platform/config/discord.ts`
- Modify: `packages/contracts/src/index.ts`

### Database schema and repos

- Create: `packages/db/src/schema/messaging-integrations.ts`
- Create: `packages/db/src/schema/messaging-targets.ts`
- Create: `packages/db/src/schema/external-conversation-bindings.ts`
- Create: `packages/db/src/schema/external-event-receipts.ts`
- Create: `packages/db/src/relations/messaging-integrations.ts`
- Create: `packages/db/src/relations/messaging-targets.ts`
- Create: `packages/db/src/relations/external-conversation-bindings.ts`
- Create: `packages/db/src/relations/external-event-receipts.ts`
- Create: `packages/db/src/repos/messaging-config.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/relations/index.ts`
- Modify: `packages/db/src/relations/profiles.ts`
- Modify: `packages/db/src/index.ts`

### Server integrations and tools

- Create: `apps/server/src/integrations/discord.ts`
- Create: `apps/server/src/integrations/messaging.ts`
- Create: `apps/server/src/tools/send-channel-message.ts`
- Create: `apps/server/src/tools/list-channel-targets.ts`
- Modify: `apps/server/src/tools/tool-sets.ts`
- Modify: `apps/server/src/tools/execution-tool-names.ts`
- Modify: `apps/server/src/routes/config.ts`
- Modify: `apps/server/src/app.ts`

### Discord ingress route

- Create: `apps/server/src/routes/integrations-discord.ts`

### Tests

- Create: `packages/db/src/repos/messaging-config.integration.test.ts`
- Create: `apps/server/src/integrations/discord.test.ts`
- Create: `apps/server/src/routes/integrations-discord.test.ts`
- Modify: `apps/server/src/tools/tool-sets.test.ts`

## Task 1: Add Failing Storage and Contract Tests

**Files:**

- Create: `packages/db/src/repos/messaging-config.integration.test.ts`
- Create: `apps/server/src/integrations/discord.test.ts`
- Create: `apps/server/src/routes/integrations-discord.test.ts`
- Modify: `apps/server/src/tools/tool-sets.test.ts`

- [ ] **Step 1: Write the failing messaging repo test**

```ts
test("upserts discord config, targets, bindings, and receipts", async () => {
  const config = await upsertMessagingPlatformConfig("profile-1", "discord", {
    enabled: true,
    botToken: "discord_bot_token",
    appId: "discord_app_123",
    publicKey: "a".repeat(64),
    webhookSecret: "",
    metadata: {},
    targets: [
      {
        alias: "friends-room",
        label: "Friends Room",
        targetType: "channel",
        targetId: "123456789012345678",
        enabled: true,
        metadata: {},
      },
    ],
  });

  const binding = await getOrCreateExternalConversationBinding({
    profileId: "profile-1",
    platform: "discord",
    scopeType: "guild_channel",
    scopeKey: "guild-1:channel-1",
    createConversation: async () => "conversation-new",
  });

  const firstReceipt = await recordExternalEventReceipt({
    profileId: "profile-1",
    platform: "discord",
    eventId: "interaction-1",
  });
  const secondReceipt = await recordExternalEventReceipt({
    profileId: "profile-1",
    platform: "discord",
    eventId: "interaction-1",
  });

  expect(config?.targets).toHaveLength(1);
  expect(binding.conversationId).toBe("conversation-new");
  expect(firstReceipt.inserted).toBe(true);
  expect(secondReceipt.inserted).toBe(false);
});
```

- [ ] **Step 2: Write the failing Discord integration test**

```ts
test("sends a discord channel message through the configured alias", async () => {
  const result = await sendDiscordMessage("profile-discord-test-1", {
    targetAlias: "friends-room",
    message: {
      type: "text",
      text: "top stories ready",
    },
  });

  expect(result.delivered).toBe(true);
  expect(result.target.targetAlias).toBe("friends-room");
  expect(result.target.targetId).toBe("123456789012345678");
});
```

- [ ] **Step 3: Write the failing Discord route test**

```ts
test("returns PING response after verifying discord signature", async () => {
  const response = await app.request("/v1/integrations/discord/events", {
    method: "POST",
    headers: signedHeadersFor({
      timestamp: "1718400000",
      rawBody: JSON.stringify({ type: 1 }),
    }),
    body: JSON.stringify({ type: 1 }),
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ type: 1 });
});
```

- [ ] **Step 4: Extend the tool inventory test**

```ts
expect(toolNames.includes("list_channel_targets")).toBe(true);
expect(toolNames.includes("send_channel_message")).toBe(true);
```

- [ ] **Step 5: Run the new tests to verify they fail**

Run: `bun test packages/db/src/repos/messaging-config.integration.test.ts apps/server/src/integrations/discord.test.ts apps/server/src/routes/integrations-discord.test.ts apps/server/src/tools/tool-sets.test.ts`
Expected: FAIL because the new repo, Discord integration, route, and tool handlers do not exist yet.

## Task 2: Implement Messaging Storage and Discord Contracts

**Files:**

- Create: `packages/contracts/src/platform/config/discord.ts`
- Create: `packages/db/src/schema/messaging-integrations.ts`
- Create: `packages/db/src/schema/messaging-targets.ts`
- Create: `packages/db/src/schema/external-conversation-bindings.ts`
- Create: `packages/db/src/schema/external-event-receipts.ts`
- Create: `packages/db/src/relations/messaging-integrations.ts`
- Create: `packages/db/src/relations/messaging-targets.ts`
- Create: `packages/db/src/relations/external-conversation-bindings.ts`
- Create: `packages/db/src/relations/external-event-receipts.ts`
- Create: `packages/db/src/repos/messaging-config.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/relations/index.ts`
- Modify: `packages/db/src/relations/profiles.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Add Discord config contracts**

```ts
const messagingTargetTypeSchema = z.enum(["channel", "group", "supergroup", "topic"]);

const discordMessagingTargetInputSchema = z.object({
  alias: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  label: z.string().trim().max(120).default(""),
  targetType: messagingTargetTypeSchema,
  targetId: z.string().trim().min(1).max(200),
  enabled: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const discordMessagingConfigInputSchema = z.object({
  enabled: z.boolean().default(false),
  botToken: z.string().trim().max(400).default(""),
  appId: z.string().trim().max(200).default(""),
  publicKey: z.string().trim().max(300).default(""),
  webhookSecret: z.string().trim().max(300).default(""),
  metadata: z.record(z.string(), z.unknown()).default({}),
  targets: z.array(discordMessagingTargetInputSchema).max(100).default([]),
});
```

- [ ] **Step 2: Add the new generic messaging tables**

```ts
const messagingIntegrationsTable = sqliteTable("messaging_integrations", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profilesTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  platform: text("platform").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  botToken: text("bot_token").notNull().default(""),
  appId: text("app_id"),
  publicKey: text("public_key"),
  webhookSecret: text("webhook_secret"),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
```

- [ ] **Step 3: Add the repo helpers**

```ts
async function upsertMessagingPlatformConfig(
  profileId: string,
  platform: "discord" | "telegram",
  input: MessagingPlatformConfigInput,
) {
  // Insert or update integration row, replace platform targets, then read back.
}

async function getOrCreateExternalConversationBinding(input: {
  profileId: string;
  platform: "discord" | "telegram";
  scopeType: "guild_channel" | "telegram_chat";
  scopeKey: string;
  createConversation: () => Promise<string>;
}) {
  // Reuse an existing binding or create a hidden internal conversation id.
}

async function recordExternalEventReceipt(input: {
  profileId: string;
  platform: "discord" | "telegram";
  eventId: string;
}) {
  // Return { inserted: false } when the event already exists.
}
```

- [ ] **Step 4: Export the new contracts, schema, relations, and repo**

```ts
export * from "./platform/config/discord";
export { messagingIntegrationsTable } from "./messaging-integrations";
export { messagingTargetsTable } from "./messaging-targets";
export { externalConversationBindingsTable } from "./external-conversation-bindings";
export { externalEventReceiptsTable } from "./external-event-receipts";
export * from "./repos/messaging-config";
```

- [ ] **Step 5: Run the storage-focused tests**

Run: `bun test packages/db/src/repos/messaging-config.integration.test.ts`
Expected: PASS

## Task 3: Implement Generic Channel Handlers

**Files:**

- Create: `apps/server/src/integrations/messaging.ts`
- Create: `apps/server/src/tools/send-channel-message.ts`
- Create: `apps/server/src/tools/list-channel-targets.ts`
- Modify: `apps/server/src/tools/tool-sets.ts`
- Modify: `apps/server/src/tools/execution-tool-names.ts`
- Modify: `apps/server/src/tools/tool-sets.test.ts`

- [ ] **Step 1: Write the generic integration dispatcher**

```ts
const listChannelTargets = async (profileId: string, platform?: ChannelPlatform) => {
  const targets = await Promise.all([
    platform === undefined || platform === "discord" ? listDiscordTargets(profileId) : [],
    platform === undefined || platform === "feishu" ? listFeishuChannelTargets(profileId) : [],
    platform === undefined || platform === "qq" ? listQqChannelTargets(profileId) : [],
  ]);

  return targets.flat();
};

const sendChannelMessage = async (profileId: string, input: SendChannelMessageInput) => {
  switch (input.platform) {
    case "discord":
      return sendDiscordMessage(profileId, input);
    case "feishu":
      return sendFeishuChannelMessage(profileId, input);
    case "qq":
      return sendQqChannelMessage(profileId, input);
    default:
      throw new Error("Telegram is not implemented yet.");
  }
};
```

- [ ] **Step 2: Add the two server tool handlers**

```ts
const createSendChannelMessageTool = (context: ServerToolContext) =>
  sendChannelMessageDef.server(async (args) => {
    const input = sendChannelMessageInputSchema.parse(args);
    const result = await sendChannelMessage(context.profileId, input);

    await appendEvent(context.profileId, "tool.send_channel_message", {
      conversationId: context.conversationId,
      turnId: context.turnId,
      platform: result.target.platform,
      targetAlias: result.target.targetAlias,
      targetId: result.target.targetId,
      messageId: result.messageId,
      preview: result.preview,
    });

    return result;
  });
```

- [ ] **Step 3: Register the tools and fix the exported tool inventory**

```ts
const executionToolNames = [
  // existing names...
  "list_channel_targets",
  "send_channel_message",
] as const;
```

- [ ] **Step 4: Run the tool inventory test**

Run: `bun test apps/server/src/tools/tool-sets.test.ts`
Expected: PASS

## Task 4: Implement Discord Outbound Delivery and Verified Ingress

**Files:**

- Create: `apps/server/src/integrations/discord.ts`
- Create: `apps/server/src/routes/integrations-discord.ts`
- Modify: `apps/server/src/routes/config.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: Implement Discord config read/save and outbound send**

```ts
const sendDiscordMessage = async (
  profileId: string,
  input: {
    targetAlias?: string;
    targetId?: string;
    message: { type: "text"; text: string };
  },
) => {
  const config = await getEffectiveDiscordConfig(profileId);
  const target = resolveDiscordTarget(config, input);

  const response = await fetch(`https://discord.com/api/v10/channels/${target.targetId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${config.botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: input.message.text }),
  });

  return {
    delivered: true,
    messageId: (await response.json()).id ?? null,
    target,
    preview: input.message.text.slice(0, 240),
  };
};
```

- [ ] **Step 2: Implement Discord interaction signature verification**

```ts
const verifyDiscordRequest = async (input: {
  rawBody: string;
  timestamp: string;
  signature: string;
  publicKey: string;
}) => {
  const verified = await crypto.subtle.verify(
    {
      name: "Ed25519",
    },
    publicKeyBytes,
    signatureBytes,
    new TextEncoder().encode(`${input.timestamp}${input.rawBody}`),
  );

  if (!verified) {
    throw new HTTPException(401, { message: "Invalid Discord signature" });
  }
};
```

- [ ] **Step 3: Add the Discord routes**

```ts
const discordIntegrationRoutes = new Hono().post("/events", async (c) => {
  const rawBody = await c.req.raw.clone().text();
  const interaction = JSON.parse(rawBody);

  if (interaction.type === 1) {
    return c.json({ type: 1 }, 200);
  }

  const receipt = await recordExternalEventReceipt({
    profileId,
    platform: "discord",
    eventId: interaction.id,
  });

  if (!receipt.inserted) {
    return c.json({ type: 4, data: { content: "Duplicate interaction ignored." } }, 200);
  }

  return c.json(
    {
      type: 4,
      data: {
        content:
          "Discord command ingress is wired. Runtime execution will be connected in the next tranche.",
      },
    },
    200,
  );
});
```

- [ ] **Step 4: Add config endpoints and route registration**

```ts
.get("/messaging/discord", async (c) => { /* ... */ })
.put("/messaging/discord", zValidator("json", discordMessagingConfigInputSchema), async (c) => { /* ... */ })
```

and

```ts
.route("/v1/integrations/discord", discordIntegrationRoutes)
```

- [ ] **Step 5: Run the Discord integration and route tests**

Run: `bun test apps/server/src/integrations/discord.test.ts apps/server/src/routes/integrations-discord.test.ts`
Expected: PASS

## Task 5: Verify the Full Tranche

**Files:**

- No new files

- [ ] **Step 1: Run the focused tranche test suite**

Run: `bun test packages/db/src/repos/messaging-config.integration.test.ts apps/server/src/integrations/discord.test.ts apps/server/src/routes/integrations-discord.test.ts apps/server/src/tools/tool-sets.test.ts`
Expected: PASS

- [ ] **Step 2: Run typechecks**

Run: `bun run typecheck:contracts && bun run typecheck:db && bun run typecheck:server`
Expected: PASS

- [ ] **Step 3: Push the schema into the local SQLite database**

Run: `bun run db:push`
Expected: drizzle reports the new messaging tables have been created or are up to date.

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/platform/config/discord.ts \
  packages/contracts/src/index.ts \
  packages/db/src/schema/messaging-integrations.ts \
  packages/db/src/schema/messaging-targets.ts \
  packages/db/src/schema/external-conversation-bindings.ts \
  packages/db/src/schema/external-event-receipts.ts \
  packages/db/src/schema/index.ts \
  packages/db/src/relations/messaging-integrations.ts \
  packages/db/src/relations/messaging-targets.ts \
  packages/db/src/relations/external-conversation-bindings.ts \
  packages/db/src/relations/external-event-receipts.ts \
  packages/db/src/relations/index.ts \
  packages/db/src/relations/profiles.ts \
  packages/db/src/repos/messaging-config.ts \
  packages/db/src/index.ts \
  packages/db/src/repos/messaging-config.integration.test.ts \
  apps/server/src/integrations/messaging.ts \
  apps/server/src/integrations/discord.ts \
  apps/server/src/integrations/discord.test.ts \
  apps/server/src/routes/integrations-discord.ts \
  apps/server/src/routes/integrations-discord.test.ts \
  apps/server/src/routes/config.ts \
  apps/server/src/app.ts \
  apps/server/src/tools/send-channel-message.ts \
  apps/server/src/tools/list-channel-targets.ts \
  apps/server/src/tools/tool-sets.ts \
  apps/server/src/tools/execution-tool-names.ts \
  apps/server/src/tools/tool-sets.test.ts \
  docs/superpowers/plans/2026-06-15-messaging-storage-generic-handlers-discord.md
git commit -m "feat: add generic messaging delivery and discord adapter"
```
