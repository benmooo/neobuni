---
title: "Discord Gateway Sidecar Implementation Plan"
---

# Discord Gateway Sidecar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Status: implemented on 2026-07-01

**Goal:** Replace the in-process Discord gateway worker with a `discord.js` sidecar that relays normalized mention/reply events into an internal server route, while keeping the server as the only runtime and Discord egress owner.

**Architecture:** Split the current `discord-gateway.ts` into a pure gateway-normalization layer, a shared inbound runtime service on the server, an internal-only Discord inbound route, and a sidecar runner that owns `discord.js` clients plus config reconciliation. The sidecar never runs agent turns directly; it only filters and relays normalized prompts to the server, which continues to own receipts, bindings, `chat_public_safe`, and `sendDiscordMessage(...)`.

**Tech Stack:** TypeScript, Bun test runner, Hono, Discord.js, existing `@buni/db` repos, existing `runExternalMessageTurn(...)` runtime path

---

## File Structure

### Shared Discord inbound runtime on server

- Create: `apps/server/src/integrations/discord-gateway-normalize.ts`
- Create: `apps/server/src/integrations/discord-gateway-normalize.test.ts`
- Create: `apps/server/src/integrations/discord-inbound.ts`
- Create: `apps/server/src/integrations/discord-inbound.test.ts`
- Modify: `apps/server/src/routes/integrations-discord.ts`
- Modify: `apps/server/src/routes/integrations-discord.test.ts`

### Internal server route

- Create: `apps/server/src/routes/integrations-discord-internal.ts`
- Create: `apps/server/src/routes/integrations-discord-internal.test.ts`
- Modify: `apps/server/src/app.ts`

### Discord sidecar

- Create: `apps/server/src/sidecars/discord-gateway/discordjs-client.ts`
- Create: `apps/server/src/sidecars/discord-gateway/discordjs-client.test.ts`
- Create: `apps/server/src/sidecars/discord-gateway/internal-runtime-client.ts`
- Create: `apps/server/src/sidecars/discord-gateway/reconcile.ts`
- Create: `apps/server/src/sidecars/discord-gateway/reconcile.test.ts`
- Create: `apps/server/src/sidecars/discord-gateway/runner.ts`
- Create: `apps/server/src/sidecars/discord-gateway/runner.test.ts`
- Create: `apps/server/src/sidecars/discord-gateway/index.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/package.json`
- Modify: `package.json`

### Dependencies and verification

- Modify: `bun.lock`

## Task 1: Extract the Shared Discord Inbound Runtime

**Files:**

- Create: `apps/server/src/integrations/discord-gateway-normalize.test.ts`
- Create: `apps/server/src/integrations/discord-gateway-normalize.ts`
- Create: `apps/server/src/integrations/discord-inbound.test.ts`
- Create: `apps/server/src/integrations/discord-inbound.ts`
- Modify: `apps/server/src/routes/integrations-discord.ts`
- Modify: `apps/server/src/routes/integrations-discord.test.ts`

- [x] **Step 1: Write the failing normalize tests**

```ts
test("normalizes a mention message into an inbound prompt", async () => {
  const { normalizeDiscordGatewayMessage } = await import("./discord-gateway-normalize");

  expect(
    normalizeDiscordGatewayMessage({
      applicationId: "discord_app_123",
      event: {
        id: "message-1",
        guild_id: "guild-1",
        channel_id: "channel-1",
        content: "<@discord_app_123> 整理今天 AI 热点",
        author: { id: "user-1", bot: false },
        mentions: [{ id: "discord_app_123", bot: true }],
      },
    }),
  ).toEqual({
    eventId: "message-1",
    scopeKey: "guild-1:channel-1",
    targetId: "channel-1",
    latestUserText: "整理今天 AI 热点",
  });
});
```

- [x] **Step 2: Run the normalize tests to verify they fail**

Run: `bun test apps/server/src/integrations/discord-gateway-normalize.test.ts`
Expected: FAIL because `discord-gateway-normalize.ts` does not exist yet.

- [x] **Step 3: Write the failing inbound-runtime tests**

```ts
test("dedupes and sends the reply through sendDiscordMessage", async () => {
  const { handleDiscordInboundMessage } = await import("./discord-inbound");

  const result = await handleDiscordInboundMessage(
    {
      profileId: "profile-1",
      inboundPrompt: {
        eventId: "message-1",
        scopeKey: "guild-1:channel-1",
        targetId: "channel-1",
        latestUserText: "整理今天 AI 热点",
      },
    },
    {
      createConversation: createConversationMock as never,
      createExternalConversationBinding: createExternalConversationBindingMock as never,
      getExternalConversationBinding: getExternalConversationBindingMock as never,
      recordExternalEventReceipt: recordExternalEventReceiptMock as never,
      runExternalMessageTurn: runExternalMessageTurnMock as never,
      sendDiscordMessage: sendDiscordMessageMock as never,
      touchExternalConversationBinding: touchExternalConversationBindingMock as never,
    },
  );

  expect(result).toMatchObject({
    duplicate: false,
    delivered: true,
    assistantText: "今天的 AI 热点如下",
  });
});
```

- [x] **Step 4: Run the inbound tests to verify they fail**

Run: `bun test apps/server/src/integrations/discord-inbound.test.ts`
Expected: FAIL because `discord-inbound.ts` does not exist yet.

- [x] **Step 5: Implement the shared normalize and inbound modules**

```ts
const executeDiscordInboundPrompt = async (...) => {
  // binding lookup/create -> touch -> runExternalMessageTurn
};

const handleDiscordInboundMessage = async (...) => {
  // receipt dedupe -> executeDiscordInboundPrompt -> sendDiscordMessage
};
```

- [x] **Step 6: Rewire the slash-command route to import from `discord-inbound.ts`**

```ts
import { executeDiscordInboundPrompt } from "../integrations/discord-inbound";
```

- [x] **Step 7: Run the focused Discord tests**

Run: `bun test apps/server/src/integrations/discord-gateway-normalize.test.ts apps/server/src/integrations/discord-inbound.test.ts apps/server/src/routes/integrations-discord.test.ts`
Expected: PASS

## Task 2: Add the Internal Discord Inbound Route

**Files:**

- Create: `apps/server/src/routes/integrations-discord-internal.test.ts`
- Create: `apps/server/src/routes/integrations-discord-internal.ts`
- Modify: `apps/server/src/app.ts`

- [x] **Step 1: Write the failing internal-route tests**

```ts
test("rejects requests without the internal bearer token", async () => {
  const { createDiscordInternalRoutes } = await import("./integrations-discord-internal");
  const app = new Hono().route(
    "/internal/integrations/discord",
    createDiscordInternalRoutes({
      handleDiscordInboundMessage: handleDiscordInboundMessageMock as never,
    }),
  );

  const response = await app.request("/internal/integrations/discord/inbound-message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validPayload),
  });

  expect(response.status).toBe(401);
});
```

- [x] **Step 2: Run the internal-route tests to verify they fail**

Run: `bun test apps/server/src/routes/integrations-discord-internal.test.ts`
Expected: FAIL because the route file does not exist yet.

- [x] **Step 3: Implement the internal route with explicit bearer-token validation**

```ts
const createDiscordInternalRoutes = (deps = defaultDeps) =>
  new Hono().post("/inbound-message", async (c) => {
    if (!hasValidInternalToken(c.req.header("authorization"))) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const payload = discordInternalInboundSchema.safeParse(await c.req.json());
    if (!payload.success) {
      return c.json({ error: "Invalid request body" }, 400);
    }

    const result = await deps.handleDiscordInboundMessage(payload.data);
    return c.json(result, 200);
  });
```

- [x] **Step 4: Register the internal route in `app.ts`**

```ts
.route("/internal/integrations/discord", discordInternalRoutes)
```

- [x] **Step 5: Run the internal-route tests**

Run: `bun test apps/server/src/routes/integrations-discord-internal.test.ts apps/server/src/routes/integrations-discord.test.ts`
Expected: PASS

## Task 3: Implement the Discord.js Sidecar

**Files:**

- Create: `apps/server/src/sidecars/discord-gateway/discordjs-client.test.ts`
- Create: `apps/server/src/sidecars/discord-gateway/discordjs-client.ts`
- Create: `apps/server/src/sidecars/discord-gateway/internal-runtime-client.ts`
- Create: `apps/server/src/sidecars/discord-gateway/reconcile.test.ts`
- Create: `apps/server/src/sidecars/discord-gateway/reconcile.ts`
- Create: `apps/server/src/sidecars/discord-gateway/runner.test.ts`
- Create: `apps/server/src/sidecars/discord-gateway/runner.ts`
- Create: `apps/server/src/sidecars/discord-gateway/index.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/package.json`
- Modify: `package.json`

- [x] **Step 1: Write the failing `discord.js` adapter tests**

```ts
test("projects a discord.js message into the normalize input and relays the prompt", async () => {
  const { createDiscordJsGatewayClient } = await import("./discordjs-client");

  const normalizedPrompts: unknown[] = [];
  const gatewayClient = createDiscordJsGatewayClient({
    profileId: "profile-1",
    config,
    createClient: () => fakeClient as never,
    normalizeDiscordGatewayMessage: normalizeDiscordGatewayMessageMock as never,
    onNormalizedInboundPrompt: async (prompt) => {
      normalizedPrompts.push(prompt);
    },
  });

  await gatewayClient.start();
  await fakeClient.emitMessageCreate(messageFixture);

  expect(normalizedPrompts).toEqual([expectedPrompt]);
});
```

- [x] **Step 2: Run the adapter tests to verify they fail**

Run: `bun test apps/server/src/sidecars/discord-gateway/discordjs-client.test.ts`
Expected: FAIL because `discordjs-client.ts` does not exist yet.

- [x] **Step 3: Write the failing reconcile/runner tests**

```ts
test("restarts a session when the config fingerprint changes", async () => {
  const { diffDiscordGatewaySessions } = await import("./reconcile");

  expect(
    diffDiscordGatewaySessions({
      running: new Map([["profile-1", runningEntry]]),
      desired: new Map([["profile-1", changedSpec]]),
    }),
  ).toEqual([{ type: "restart", profileId: "profile-1", spec: changedSpec }]);
});
```

- [x] **Step 4: Run the reconcile/runner tests to verify they fail**

Run: `bun test apps/server/src/sidecars/discord-gateway/reconcile.test.ts apps/server/src/sidecars/discord-gateway/runner.test.ts`
Expected: FAIL because the sidecar files do not exist yet.

- [x] **Step 5: Implement the sidecar transport, internal client, reconcile logic, and runner**

```ts
const createInternalRuntimeClient = (...) => ({
  sendInboundPrompt: async (input) => {
    return fetch(`${baseUrl}/internal/integrations/discord/inbound-message`, ...);
  },
});

const createDiscordGatewayRunner = (...) => {
  // list profiles -> getEffectiveDiscordConfig -> build specs -> diff -> start/stop/restart
};
```

- [x] **Step 6: Remove gateway startup from `src/index.ts` and add a dedicated sidecar entrypoint**

```ts
startReflectionReportScheduler();
startScheduleMaterializer();
startTaskRunWorker();
```

`src/index.ts` should no longer call any Discord gateway bootstrap.

- [x] **Step 7: Add the sidecar dev scripts**

```json
{
  "scripts": {
    "dev": "dotenv -e .env.dev -- bun --hot src/index.ts",
    "dev:discord-gateway-sidecar": "dotenv -e .env.dev -- bun --hot src/sidecars/discord-gateway/index.ts"
  }
}
```

And at the repo root:

```json
{
  "scripts": {
    "dev:discord-gateway-sidecar": "cd apps/server && bun run dev:discord-gateway-sidecar"
  }
}
```

- [x] **Step 8: Add `discord.js` as a server dependency**

Run: `cd apps/server && bun add discord.js`
Expected: `package.json` and `bun.lock` update with `discord.js`.

- [x] **Step 9: Run the focused sidecar tests**

Run: `bun test apps/server/src/sidecars/discord-gateway/discordjs-client.test.ts apps/server/src/sidecars/discord-gateway/reconcile.test.ts apps/server/src/sidecars/discord-gateway/runner.test.ts`
Expected: PASS

## Task 4: End-to-End Verification

**Files:**

- No new files

- [x] **Step 1: Run all focused Discord tests**

Run: `bun test apps/server/src/integrations/discord-gateway-normalize.test.ts apps/server/src/integrations/discord-inbound.test.ts apps/server/src/routes/integrations-discord.test.ts apps/server/src/routes/integrations-discord-internal.test.ts apps/server/src/sidecars/discord-gateway/discordjs-client.test.ts apps/server/src/sidecars/discord-gateway/reconcile.test.ts apps/server/src/sidecars/discord-gateway/runner.test.ts`
Expected: PASS

- [x] **Step 2: Run server typecheck**

Run: `bun run typecheck:server`
Expected: PASS

- [x] **Step 3: Review the final diff before completion**

Run: `git diff --stat`
Expected: Discord gateway code split across inbound service, internal route, and sidecar files; server startup no longer owns the gateway.
