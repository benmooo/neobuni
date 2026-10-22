---
title: "Messaging Runtime Foundations Implementation Plan"
---

# Messaging Runtime Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first implementation tranche for Discord/Telegram personal-mode integration by adding surface policy foundations and generic channel delivery contracts without changing the memory owner model.

**Architecture:** Keep `profile` as the only memory owner and introduce a surface-aware runtime boundary that can disable personal memory recall for public group interactions. In parallel, replace schedule delivery's Feishu-specific target shape with a generic channel target contract that later Discord/Telegram adapters can consume.

**Tech Stack:** TypeScript, Bun test runner, Zod, Hono, Drizzle-style repo/schema layer, TanStack AI tool contracts

---

## File Structure

### Runtime surface policy

- Create: `packages/contracts/src/runtime/surface.ts`
- Create: `packages/contracts/src/runtime/surface.test.ts`
- Create: `apps/server/src/runtime/surface-policy.ts`
- Create: `apps/server/src/runtime/surface-policy.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/server/src/runtime/load-turn-context.ts`
- Modify: `apps/server/src/runtime/run-headless-task-turn.ts`

### Generic channel delivery contracts

- Create: `packages/contracts/src/execution-layer/channel-target.ts`
- Create: `packages/contracts/src/execution-layer/send-channel-message.ts`
- Create: `packages/contracts/src/execution-layer/list-channel-targets.ts`
- Create: `packages/contracts/src/execution-layer/channel-tools.test.ts`
- Modify: `packages/contracts/src/execution-layer/schedule.ts`
- Modify: `packages/contracts/src/execution-layer/create-schedule.ts`
- Modify: `packages/contracts/src/execution-layer/update-schedule.ts`
- Modify: `packages/contracts/src/execution-layer/tools.ts`
- Modify: `packages/contracts/src/index.ts`

### Schedule blueprint + materialization migration

- Modify: `apps/server/src/tools/schedule-tool-blueprint.ts`
- Modify: `apps/server/src/tools/schedule-tool-blueprint.test.ts`
- Modify: `apps/server/src/schedules/materialized-task-config.ts`
- Modify: `apps/server/src/schedules/materialize.test.ts`

## Task 1: Add Surface Policy Contracts

**Files:**

- Create: `packages/contracts/src/runtime/surface.ts`
- Create: `packages/contracts/src/runtime/surface.test.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, expect, test } from "bun:test";

import { runtimeSurfaceSchema, surfacePolicySchema } from "./surface";

describe("runtime surface contracts", () => {
  test("parses the public-safe surface policy", () => {
    const parsed = surfacePolicySchema.parse({
      surface: "chat_public_safe",
      allowMemoryRecall: false,
      allowMemoryWrite: false,
      allowAutobiographicalContext: false,
      allowScheduleMutation: true,
      toolAllowlist: ["search_web", "send_channel_message"],
      responseVisibility: "group",
    });

    expect(parsed.surface).toBe("chat_public_safe");
    expect(parsed.responseVisibility).toBe("group");
  });

  test("rejects unknown runtime surfaces", () => {
    expect(() => runtimeSurfaceSchema.parse("discord_unsafe")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/contracts/src/runtime/surface.test.ts`
Expected: FAIL because `./surface` does not exist yet.

- [ ] **Step 3: Write minimal runtime surface contracts**

```ts
import { z } from "zod";

const runtimeSurfaceSchema = z.enum([
  "chat_private",
  "chat_public_safe",
  "task_run_private",
  "task_run_public_safe",
]);

const surfaceResponseVisibilitySchema = z.enum(["private", "group"]);

const surfacePolicySchema = z.object({
  surface: runtimeSurfaceSchema,
  allowMemoryRecall: z.boolean(),
  allowMemoryWrite: z.boolean(),
  allowAutobiographicalContext: z.boolean(),
  allowScheduleMutation: z.boolean(),
  toolAllowlist: z.array(z.string().trim().min(1)).nullable(),
  responseVisibility: surfaceResponseVisibilitySchema,
});

export { runtimeSurfaceSchema, surfacePolicySchema, surfaceResponseVisibilitySchema };

export type RuntimeSurface = z.infer<typeof runtimeSurfaceSchema>;
export type SurfacePolicy = z.infer<typeof surfacePolicySchema>;
export type SurfaceResponseVisibility = z.infer<typeof surfaceResponseVisibilitySchema>;
```

- [ ] **Step 4: Export the new contracts**

```ts
export * from "./runtime/surface";
```

Add the export to `packages/contracts/src/index.ts`.

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test packages/contracts/src/runtime/surface.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/runtime/surface.ts \
  packages/contracts/src/runtime/surface.test.ts \
  packages/contracts/src/index.ts
git commit -m "feat: add runtime surface contracts"
```

## Task 2: Add Server-Side Surface Policy Helpers

**Files:**

- Create: `apps/server/src/runtime/surface-policy.ts`
- Create: `apps/server/src/runtime/surface-policy.test.ts`
- Modify: `apps/server/src/tools/execution-tool-names.ts`
- Modify: `apps/server/src/tools/tool-sets.test.ts`

- [ ] **Step 1: Write the failing server policy test**

```ts
import { describe, expect, test } from "bun:test";

import { getSurfacePolicy, filterToolNamesForSurfacePolicy } from "./surface-policy";

describe("surface-policy", () => {
  test("returns a public-safe group policy with no memory access", () => {
    const policy = getSurfacePolicy("chat_public_safe");

    expect(policy.allowMemoryRecall).toBe(false);
    expect(policy.allowMemoryWrite).toBe(false);
    expect(policy.responseVisibility).toBe("group");
  });

  test("filters schedule mutations out of public-safe task runs", () => {
    expect(
      filterToolNamesForSurfacePolicy(
        ["create_schedule", "search_web", "send_channel_message"],
        getSurfacePolicy("task_run_public_safe"),
      ),
    ).toEqual(["search_web", "send_channel_message"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/server/src/runtime/surface-policy.test.ts`
Expected: FAIL because `./surface-policy` does not exist yet.

- [ ] **Step 3: Write minimal surface policy helpers**

```ts
import type { RuntimeSurface, SurfacePolicy } from "@buni/contracts";

import { scheduleMutationToolNameSet } from "../tools/execution-tool-names";

const getSurfacePolicy = (surface: RuntimeSurface): SurfacePolicy => {
  if (surface === "chat_public_safe" || surface === "task_run_public_safe") {
    return {
      surface,
      allowMemoryRecall: false,
      allowMemoryWrite: false,
      allowAutobiographicalContext: false,
      allowScheduleMutation: true,
      toolAllowlist: null,
      responseVisibility: "group",
    };
  }

  return {
    surface,
    allowMemoryRecall: true,
    allowMemoryWrite: true,
    allowAutobiographicalContext: true,
    allowScheduleMutation: true,
    toolAllowlist: null,
    responseVisibility: "private",
  };
};

const filterToolNamesForSurfacePolicy = (toolNames: readonly string[], policy: SurfacePolicy) =>
  toolNames.filter(
    (toolName) => policy.allowScheduleMutation || !scheduleMutationToolNameSet.has(toolName),
  );

export { filterToolNamesForSurfacePolicy, getSurfacePolicy };
```

- [ ] **Step 4: Export the schedule mutation set**

```ts
export {
  defaultMaterializedToolAllowlist,
  executionToolNames,
  scheduleMutationToolNameSet,
  scheduleMutationToolNames,
};
```

Add `scheduleMutationToolNameSet` to the exports in `apps/server/src/tools/execution-tool-names.ts`.

- [ ] **Step 5: Run the policy tests and existing tool inventory tests**

Run: `bun test apps/server/src/runtime/surface-policy.test.ts apps/server/src/tools/tool-sets.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/runtime/surface-policy.ts \
  apps/server/src/runtime/surface-policy.test.ts \
  apps/server/src/tools/execution-tool-names.ts \
  apps/server/src/tools/tool-sets.test.ts
git commit -m "feat: add server surface policy helpers"
```

## Task 3: Make Turn Context Loading Surface-Aware

**Files:**

- Modify: `apps/server/src/runtime/load-turn-context.ts`
- Modify: `apps/server/src/runtime/run-headless-task-turn.ts`
- Create: `apps/server/src/runtime/surface-policy.test.ts`

- [ ] **Step 1: Extend the failing policy test to cover memory slicing**

```ts
import { applyMemoryPolicy } from "./surface-policy";

test("drops memory slices for public-safe surfaces", () => {
  expect(
    applyMemoryPolicy({
      policy: getSurfacePolicy("chat_public_safe"),
      unresolvedSlices: [{ id: "u1" }],
      recentSlices: [{ id: "r1" }],
    }),
  ).toEqual({
    unresolvedSlices: [],
    recentSlices: [],
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/server/src/runtime/surface-policy.test.ts`
Expected: FAIL because `applyMemoryPolicy` does not exist yet.

- [ ] **Step 3: Add a pure memory policy helper**

```ts
const applyMemoryPolicy = <T>(input: {
  policy: SurfacePolicy;
  unresolvedSlices: T[];
  recentSlices: T[];
}) =>
  input.policy.allowMemoryRecall
    ? {
        unresolvedSlices: [...input.unresolvedSlices],
        recentSlices: [...input.recentSlices],
      }
    : {
        unresolvedSlices: [] as T[],
        recentSlices: [] as T[],
      };
```

Export it from `apps/server/src/runtime/surface-policy.ts`.

- [ ] **Step 4: Thread surface policy into turn context loading**

```ts
const loadTurnContext = async (input: {
  profileId: string;
  conversationId: string;
  latestUserText: string;
  clientTimezone: string | null;
  currentTurnId: string;
  surfacePolicy?: SurfacePolicy | null;
}) => {
  // ...
  const memorySlices = applyMemoryPolicy({
    policy: input.surfacePolicy ?? getSurfacePolicy("chat_private"),
    unresolvedSlices: unresolvedMemories.map(toMemorySlice),
    recentSlices: recentMemories.map(toMemorySlice),
  });

  const turnContext = buildTurnContext({
    // ...
    unresolvedSlices: memorySlices.unresolvedSlices,
    recentSlices: memorySlices.recentSlices,
  });
};
```

Also update `runHeadlessTaskTurn(...)` to accept an optional `surfacePolicy` input and pass it through to `loadTurnContext` once the shared `runAgentTurn(...)` refactor lands. For this tranche, keep the function signature ready even if the current implementation still uses execution-tool-only mode.

- [ ] **Step 5: Run tests**

Run: `bun test apps/server/src/runtime/surface-policy.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/runtime/surface-policy.ts \
  apps/server/src/runtime/surface-policy.test.ts \
  apps/server/src/runtime/load-turn-context.ts \
  apps/server/src/runtime/run-headless-task-turn.ts
git commit -m "feat: make turn context surface aware"
```

## Task 4: Add Generic Channel Target Contracts

**Files:**

- Create: `packages/contracts/src/execution-layer/channel-target.ts`
- Create: `packages/contracts/src/execution-layer/send-channel-message.ts`
- Create: `packages/contracts/src/execution-layer/list-channel-targets.ts`
- Create: `packages/contracts/src/execution-layer/channel-tools.test.ts`
- Modify: `packages/contracts/src/execution-layer/schedule.ts`
- Modify: `packages/contracts/src/execution-layer/create-schedule.ts`
- Modify: `packages/contracts/src/execution-layer/update-schedule.ts`
- Modify: `packages/contracts/src/execution-layer/tools.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, expect, test } from "bun:test";

import { scheduleDeliveryIntentSchema, sendChannelMessageInputSchema } from "./tools";

describe("channel delivery contracts", () => {
  test("parses a schedule delivery intent with a generic channel target", () => {
    const parsed = scheduleDeliveryIntentSchema.parse({
      conversationId: null,
      channelTarget: {
        platform: "telegram",
        targetAlias: "friends-group",
        targetId: null,
      },
    });

    expect(parsed.channelTarget?.platform).toBe("telegram");
  });

  test("requires a target alias or target id when sending a channel message", () => {
    expect(() =>
      sendChannelMessageInputSchema.parse({
        message: { type: "text", text: "hello" },
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/contracts/src/execution-layer/channel-tools.test.ts`
Expected: FAIL because the new channel contracts do not exist yet.

- [ ] **Step 3: Implement the channel target schemas**

```ts
import { z } from "zod";

const channelPlatformSchema = z.enum(["discord", "telegram", "feishu", "qq"]);

const channelTargetSchema = z
  .object({
    platform: channelPlatformSchema,
    targetAlias: z.string().trim().min(1).nullable().default(null),
    targetId: z.string().trim().min(1).nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.targetAlias === null && value.targetId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetAlias"],
        message: "Either targetAlias or targetId is required.",
      });
    }
  });
```

Use it in:

```ts
const scheduleDeliveryIntentSchema = z.object({
  conversationId: z.string().trim().min(1).nullable().default(null),
  channelTarget: channelTargetSchema.nullable().default(null),
});
```

and create `sendChannelMessageInputSchema` with a text-only payload.

- [ ] **Step 4: Export the new contracts**

```ts
export * from "./channel-target";
export * from "./send-channel-message";
export * from "./list-channel-targets";
```

Add the exports to `packages/contracts/src/execution-layer/tools.ts` and `packages/contracts/src/index.ts`.

- [ ] **Step 5: Run tests**

Run: `bun test packages/contracts/src/execution-layer/channel-tools.test.ts packages/contracts/src/execution-layer/time-tools.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/execution-layer/channel-target.ts \
  packages/contracts/src/execution-layer/send-channel-message.ts \
  packages/contracts/src/execution-layer/list-channel-targets.ts \
  packages/contracts/src/execution-layer/channel-tools.test.ts \
  packages/contracts/src/execution-layer/schedule.ts \
  packages/contracts/src/execution-layer/create-schedule.ts \
  packages/contracts/src/execution-layer/update-schedule.ts \
  packages/contracts/src/execution-layer/tools.ts \
  packages/contracts/src/index.ts
git commit -m "feat: add generic channel delivery contracts"
```

## Task 5: Migrate Schedule Blueprint and Materialization to Channel Targets

**Files:**

- Modify: `apps/server/src/tools/schedule-tool-blueprint.ts`
- Modify: `apps/server/src/tools/schedule-tool-blueprint.test.ts`
- Modify: `apps/server/src/schedules/materialized-task-config.ts`
- Modify: `apps/server/src/schedules/materialize.test.ts`

- [ ] **Step 1: Write the failing blueprint test**

```ts
test("captures a generic channel target in the blueprint delivery intent", () => {
  const blueprint = buildScheduleBlueprintFromCreateInput({
    type: "monitor",
    title: "Morning summary",
    content: "Send a summary",
    taskPrompt: "Fetch headlines and send them to Telegram.",
    cronExpr: "0 8 * * *",
    triggerAt: null,
    timezone: "Asia/Shanghai",
    toolAllowlist: ["get_news_headlines", "send_channel_message"],
    maxSteps: 4,
    timeoutMs: 120_000,
    channelTarget: {
      platform: "telegram",
      targetAlias: "friends-group",
      targetId: null,
    },
    deliverToConversation: false,
    input: null,
    conversationId: "conversation-1",
  });

  expect(blueprint.deliveryIntent).toEqual({
    conversationId: null,
    channelTarget: {
      platform: "telegram",
      targetAlias: "friends-group",
      targetId: null,
    },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/server/src/tools/schedule-tool-blueprint.test.ts`
Expected: FAIL because `channelTarget` is not recognized yet.

- [ ] **Step 3: Implement the blueprint migration**

```ts
const buildScheduleBlueprintFromCreateInput = (
  input: CreateScheduleInput & { conversationId: string | null },
) => ({
  version: 1 as const,
  prompt: input.taskPrompt,
  toolAllowlist: input.toolAllowlist ?? null,
  maxSteps: input.maxSteps ?? null,
  timeoutMs: input.timeoutMs ?? null,
  deliveryIntent: {
    conversationId: input.deliverToConversation === false ? null : input.conversationId,
    channelTarget: input.channelTarget ?? null,
  },
  input: input.input ?? null,
});
```

Mirror the same shape in `mergeScheduleBlueprintForUpdate(...)`.

- [ ] **Step 4: Migrate materialization snapshots**

```ts
const buildTaskRunInputSnapshot = (schedule: PersistedSchedule, scheduledFor: string) => {
  const blueprint = readScheduleBlueprint(schedule);

  return {
    scheduleId: schedule.id,
    scheduleType: schedule.type,
    timezone: schedule.timezone,
    scheduledFor,
    source: "schedule_materializer",
    metadata: schedule.metadata,
    blueprintInput: isRecord(blueprint?.input) ? blueprint.input : null,
    deliveryIntent: isRecord(blueprint?.deliveryIntent) ? blueprint.deliveryIntent : null,
  };
};
```

Update tests so they expect `channelTarget` instead of `feishuTargetAlias`.

- [ ] **Step 5: Run tests**

Run: `bun test apps/server/src/tools/schedule-tool-blueprint.test.ts apps/server/src/schedules/materialize.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/tools/schedule-tool-blueprint.ts \
  apps/server/src/tools/schedule-tool-blueprint.test.ts \
  apps/server/src/schedules/materialized-task-config.ts \
  apps/server/src/schedules/materialize.test.ts
git commit -m "refactor: migrate schedule delivery to channel targets"
```

## Plan Self-Review

### Spec coverage

- `public_safe` runtime boundary: covered by Tasks 1-3.
- generic channel delivery intent: covered by Tasks 4-5.
- generic tool surface groundwork: covered by Task 4 at the contract layer only; handler registration is intentionally deferred until the messaging adapters exist.
- full Discord / Telegram adapters: intentionally deferred to the next implementation plan after foundations land.

### Placeholder scan

- No `TODO`, `TBD`, or “similar to above” placeholders remain.
- Every task includes file paths, code blocks, commands, and expected outcomes.

### Type consistency

- `channelTarget` is used consistently across schedule contracts, blueprint migration, and task run snapshots.
- `RuntimeSurface` / `SurfacePolicy` names match between contracts and server helpers.
- The plan explicitly avoids registering `send_channel_message` / `list_channel_targets` in the live tool inventory before handlers exist, so `executionToolNames` remains consistent with `createExecutionTools(...)` during this tranche.

Plan complete and saved to `docs/superpowers/plans/2026-06-15-messaging-runtime-foundations.md`.

Given you explicitly asked to start implementation, the next step is **Inline Execution** using `superpowers:executing-plans`.
