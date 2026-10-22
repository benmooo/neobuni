---
title: "Discord External Conversation Rollover Implementation Plan"
---

# Discord External Conversation Rollover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real rollover for Discord external conversations so one channel no longer writes and reasons through an unbounded hidden conversation forever.

**Architecture:** Keep Discord channel continuity anchored on one `scopeKey -> active conversationId` binding, but move the current window into a dedicated resolver that can create, reuse, repair, or roll over the active hidden conversation. Put the rollover decision into a pure core, keep the DB mutation path transactional, and let `discord-inbound.ts` call one explicit resolver before `runExternalMessageTurn(...)`.

**Tech Stack:** TypeScript, Bun test runner, Bun SQLite, drizzle-orm, Zod, existing Discord inbound/runtime path

---

## File Structure

- Create: `packages/db/src/repos/discord-external-conversation-rollover.ts`
- Create: `packages/db/src/repos/discord-external-conversation-rollover.test.ts`
- Create: `packages/db/src/repos/discord-external-conversations.ts`
- Create: `packages/db/src/repos/discord-external-conversations.integration.test.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `apps/server/src/integrations/discord-inbound.ts`
- Modify: `apps/server/src/integrations/discord-inbound.test.ts`
- Modify: `apps/server/src/routes/integrations-discord.ts`
- Modify: `apps/server/src/routes/integrations-discord.test.ts`
- Modify: `docs/superpowers/specs/2026-07-02-discord-external-conversation-rollover-design.md`

### Task 1: Add Pure Discord Rollover Core

**Files:**

- Create: `packages/db/src/repos/discord-external-conversation-rollover.ts`
- Create: `packages/db/src/repos/discord-external-conversation-rollover.test.ts`

- [x] **Step 1: Write the failing rollover-core tests**

```ts
test("returns message_count when the window reaches the max message threshold", async () => {
  const {
    decideDiscordExternalConversationRollover,
    DISCORD_EXTERNAL_CONVERSATION_ROLLOVER_LIMITS,
  } = await import("./discord-external-conversation-rollover");

  expect(
    decideDiscordExternalConversationRollover({
      stats: {
        messageCount: DISCORD_EXTERNAL_CONVERSATION_ROLLOVER_LIMITS.maxWindowMessageCount,
        totalContentChars: 100,
        estimatedTokens: 25,
        lastMessageAt: "2026-07-02T08:00:00.000Z",
      },
      now: "2026-07-02T08:00:01.000Z",
    }),
  ).toEqual({
    shouldRollover: true,
    reason: "message_count",
  });
});

test("selects the latest non-system seed messages and preserves order", async () => {
  const { selectDiscordExternalConversationSeedMessages } =
    await import("./discord-external-conversation-rollover");

  expect(
    selectDiscordExternalConversationSeedMessages({
      messages: [
        {
          id: "m1",
          role: "system",
          kind: "text",
          content: "sys",
          metadata: {},
          createdAt: "2026-07-02T08:00:00.000Z",
        },
        {
          id: "m2",
          role: "user",
          kind: "text",
          content: "u1",
          metadata: {},
          createdAt: "2026-07-02T08:01:00.000Z",
        },
        {
          id: "m3",
          role: "assistant",
          kind: "generated",
          content: "a1",
          metadata: {},
          createdAt: "2026-07-02T08:02:00.000Z",
        },
        {
          id: "m4",
          role: "user",
          kind: "text",
          content: "u2",
          metadata: {},
          createdAt: "2026-07-02T08:03:00.000Z",
        },
      ],
      seedMessageCount: 2,
    }).map((message) => message.id),
  ).toEqual(["m3", "m4"]);
});
```

- [x] **Step 2: Run the rollover-core tests to verify they fail**

Run: `bun test packages/db/src/repos/discord-external-conversation-rollover.test.ts`
Expected: FAIL because the rollover core does not exist yet.

- [x] **Step 3: Implement the pure rollover core**

```ts
const DISCORD_EXTERNAL_CONVERSATION_ROLLOVER_LIMITS = {
  maxWindowMessageCount: 120,
  maxWindowEstimatedTokens: 24_000,
  maxWindowIdleMs: 72 * 60 * 60 * 1000,
  seedMessageCount: 12,
} as const;

const estimateDiscordExternalConversationTokens = (totalContentChars: number) =>
  Math.ceil(totalContentChars / 4);

const decideDiscordExternalConversationRollover = (input: {
  stats: DiscordExternalConversationWindowStats;
  now: string;
  limits?: DiscordExternalConversationRolloverLimits;
}) => {
  const limits = input.limits ?? DISCORD_EXTERNAL_CONVERSATION_ROLLOVER_LIMITS;

  if (input.stats.messageCount >= limits.maxWindowMessageCount) {
    return { shouldRollover: true, reason: "message_count" as const };
  }

  if (input.stats.estimatedTokens >= limits.maxWindowEstimatedTokens) {
    return { shouldRollover: true, reason: "estimated_tokens" as const };
  }

  if (
    input.stats.lastMessageAt &&
    Date.parse(input.now) - Date.parse(input.stats.lastMessageAt) >= limits.maxWindowIdleMs
  ) {
    return { shouldRollover: true, reason: "idle" as const };
  }

  return { shouldRollover: false, reason: null };
};
```

- [x] **Step 4: Run the rollover-core tests to verify they pass**

Run: `bun test packages/db/src/repos/discord-external-conversation-rollover.test.ts`
Expected: PASS

### Task 2: Add a Transactional Discord Active-Window Resolver

**Files:**

- Create: `packages/db/src/repos/discord-external-conversations.ts`
- Create: `packages/db/src/repos/discord-external-conversations.integration.test.ts`
- Modify: `packages/db/src/index.ts`

- [x] **Step 1: Write the failing integration tests for create / reuse / rollover / repair**

```ts
test("rolls over an existing discord channel window, seeds the tail, and rebinds the scope", async () => {
  const { resolveDiscordExternalConversationWindow } =
    await import("./discord-external-conversations");

  const result = await resolveDiscordExternalConversationWindow({
    profileId: "profile-1",
    scopeKey: "guild-1:channel-1",
    now: "2026-07-02T10:00:00.000Z",
    limits: {
      maxWindowMessageCount: 2,
      maxWindowEstimatedTokens: 24_000,
      maxWindowIdleMs: 72 * 60 * 60 * 1000,
      seedMessageCount: 2,
    },
  });

  expect(result.lifecycle).toBe("rolled_over");
  expect(result.previousConversationId).toBe("conversation-1");
  expect(result.conversationId).not.toBe("conversation-1");
});
```

- [x] **Step 2: Run the resolver integration tests to verify they fail**

Run: `bun test packages/db/src/repos/discord-external-conversations.integration.test.ts`
Expected: FAIL because the resolver does not exist yet.

- [x] **Step 3: Implement the transactional resolver**

```ts
const resolveDiscordExternalConversationWindow = async (input: {
  profileId: string;
  scopeKey: string;
  now?: string;
  limits?: DiscordExternalConversationRolloverLimits;
}) =>
  db.transaction(
    (tx) => {
      const now = input.now ?? new Date().toISOString();
      const binding = readDiscordBinding(tx, input);

      if (!binding) {
        return createFirstDiscordWindow(tx, input, now);
      }

      const conversation = readConversation(tx, binding.conversationId);
      if (!conversation || conversation.status !== "active") {
        return repairDiscordWindowBinding(tx, input, binding, now);
      }

      const stats = readDiscordConversationStats(tx, conversation.id);
      const rollover = decideDiscordExternalConversationRollover({
        stats,
        now,
        limits: input.limits,
      });

      return rollover.shouldRollover
        ? rolloverDiscordWindow(tx, input, binding, conversation.id, rollover.reason, now)
        : touchAndReuseDiscordWindow(tx, binding, now);
    },
    { behavior: "immediate" },
  );
```

- [x] **Step 4: Export the resolver through `packages/db/src/index.ts`**

```ts
export * from "./repos/discord-external-conversations";
```

- [x] **Step 5: Run the resolver integration tests to verify they pass**

Run: `bun test packages/db/src/repos/discord-external-conversations.integration.test.ts`
Expected: PASS

### Task 3: Rewire Discord Inbound and Slash Command Execution

**Files:**

- Modify: `apps/server/src/integrations/discord-inbound.ts`
- Modify: `apps/server/src/integrations/discord-inbound.test.ts`
- Modify: `apps/server/src/routes/integrations-discord.ts`
- Modify: `apps/server/src/routes/integrations-discord.test.ts`

- [x] **Step 1: Write the failing inbound tests against the new resolver contract**

```ts
test("resolves the active discord conversation window before running the external turn", async () => {
  const { handleDiscordInboundMessage } = await import("./discord-inbound");

  await handleDiscordInboundMessage(
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
      recordExternalEventReceipt: recordExternalEventReceiptMock as never,
      resolveDiscordExternalConversationWindow:
        resolveDiscordExternalConversationWindowMock as never,
      runExternalMessageTurn: runExternalMessageTurnMock as never,
      sendDiscordMessage: sendDiscordMessageMock as never,
    },
  );

  expect(resolveDiscordExternalConversationWindowMock).toHaveBeenCalledWith({
    profileId: "profile-1",
    scopeKey: "guild-1:channel-1",
  });
});
```

- [x] **Step 2: Run the inbound tests to verify they fail**

Run: `bun test apps/server/src/integrations/discord-inbound.test.ts apps/server/src/routes/integrations-discord.test.ts`
Expected: FAIL because the inbound path still depends on manual binding + conversation creation.

- [x] **Step 3: Implement the new resolver-based inbound path**

```ts
const executeDiscordInboundPrompt = async (
  input: {
    profileId: string;
    scopeKey: string;
    latestUserText: string;
    externalThreadId: string;
  },
  deps: ExecuteDiscordInboundPromptDeps = defaultExecuteDiscordInboundPromptDeps,
) => {
  const resolved = await deps.resolveDiscordExternalConversationWindow({
    profileId: input.profileId,
    scopeKey: input.scopeKey,
  });

  const runtimeResult = await deps.runExternalMessageTurn({
    profileId: input.profileId,
    conversationId: resolved.conversationId,
    latestUserText: input.latestUserText,
    platform: "discord",
    externalThreadId: input.externalThreadId,
    clientTimezone: null,
  });

  return {
    conversationId: resolved.conversationId,
    assistantText: runtimeResult.assistantText,
  };
};
```

- [x] **Step 4: Run the inbound tests to verify they pass**

Run: `bun test apps/server/src/integrations/discord-inbound.test.ts apps/server/src/routes/integrations-discord.test.ts`
Expected: PASS

### Task 4: Verification and Doc Alignment

**Files:**

- Modify: `docs/superpowers/specs/2026-07-02-discord-external-conversation-rollover-design.md`

- [x] **Step 1: Mark the design spec implemented**

```md
> 状态：implemented
```

- [x] **Step 2: Run the focused Discord + repo test suite**

Run: `bun test packages/db/src/repos/discord-external-conversation-rollover.test.ts packages/db/src/repos/discord-external-conversations.integration.test.ts apps/server/src/integrations/discord-inbound.test.ts apps/server/src/routes/integrations-discord.test.ts`
Expected: PASS

- [x] **Step 3: Run the broader Discord suite**

Run: `bun test apps/server/src/sidecars/discord-gateway/*.test.ts apps/server/src/runtime/discord-gateway-sidecar-monitor.test.ts apps/server/src/routes/runtime-discord-gateway.test.ts apps/server/src/routes/integrations-discord-internal.test.ts apps/server/src/integrations/discord-gateway-normalize.test.ts apps/server/src/integrations/discord-inbound.test.ts apps/server/src/routes/integrations-discord.test.ts`
Expected: PASS

- [x] **Step 4: Run server typecheck**

Run: `bun run typecheck:server`
Expected: PASS
