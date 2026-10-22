---
title: "Discord Gateway Runner FP Refactor Implementation Plan"
---

# Discord Gateway Runner FP Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Status: implemented on 2026-07-02

**Goal:** Refactor the Discord gateway sidecar runner into a functional core plus imperative shell without changing the external sidecar contract.

**Architecture:** Introduce a serializable runner state, pure reconcile planning, and pure heartbeat selectors. Keep `runner.ts` as the only place that owns timers, `discord.js` controllers, and I/O. Remove the separate mutable heartbeat state so ops data becomes a projection of the runner state.

**Tech Stack:** TypeScript, Bun test runner, Zod, discord.js, existing sidecar runtime routes

---

## File Structure

- Create: `apps/server/src/sidecars/discord-gateway/runner-state.ts`
- Create: `apps/server/src/sidecars/discord-gateway/runner-state.test.ts`
- Create: `apps/server/src/sidecars/discord-gateway/runner-core.ts`
- Create: `apps/server/src/sidecars/discord-gateway/runner-core.test.ts`
- Create: `apps/server/src/sidecars/discord-gateway/runner-selectors.ts`
- Create: `apps/server/src/sidecars/discord-gateway/runner-selectors.test.ts`
- Modify: `apps/server/src/sidecars/discord-gateway/reconcile.ts`
- Modify: `apps/server/src/sidecars/discord-gateway/reconcile.test.ts`
- Modify: `apps/server/src/sidecars/discord-gateway/runner.ts`
- Modify: `apps/server/src/sidecars/discord-gateway/runner.test.ts`
- Delete: `apps/server/src/sidecars/discord-gateway/heartbeat-state.ts`
- Delete: `apps/server/src/sidecars/discord-gateway/heartbeat-state.test.ts`
- Modify: `docs/superpowers/specs/2026-07-02-discord-gateway-runner-fp-refactor-design.md`

### Task 1: Define Serializable Runner State

**Files:**
- Create: `apps/server/src/sidecars/discord-gateway/runner-state.ts`
- Create: `apps/server/src/sidecars/discord-gateway/runner-state.test.ts`

- [ ] **Step 1: Write the failing state tests**

```ts
test("creates an initial idle runner state with no sessions", async () => {
  const { createInitialDiscordGatewayRunnerState } = await import("./runner-state");

  expect(createInitialDiscordGatewayRunnerState({
    enabled: true,
    startedAt: "2026-07-02T08:00:00.000Z",
  })).toEqual({
    enabled: true,
    startedAt: "2026-07-02T08:00:00.000Z",
    phase: "idle",
    lastReconcileAt: null,
    lastReconcileStatus: "idle",
    lastReconcileErrorMessage: null,
    sessions: {},
  });
});
```

- [ ] **Step 2: Run the state tests to verify they fail**

Run: `bun test apps/server/src/sidecars/discord-gateway/runner-state.test.ts`
Expected: FAIL because `runner-state.ts` does not exist.

- [ ] **Step 3: Implement the state schema and constructor**

```ts
const discordGatewayRunnerStateSchema = z.object({
  enabled: z.boolean(),
  phase: z.enum(["idle", "reconciling"]),
  lastReconcileAt: isoDateTimeSchema.nullable(),
  lastReconcileStatus: discordGatewaySidecarReconcileStatusSchema,
  lastReconcileErrorMessage: z.string().trim().min(1).nullable(),
  sessions: z.record(z.string(), discordGatewayTrackedSessionSchema),
});

const createInitialDiscordGatewayRunnerState = (input: {
  enabled: boolean;
  startedAt: string;
}): DiscordGatewayRunnerState => ({
  enabled: input.enabled,
  startedAt: input.startedAt,
  phase: "idle",
  lastReconcileAt: null,
  lastReconcileStatus: "idle",
  lastReconcileErrorMessage: null,
  sessions: {},
});
```

- [ ] **Step 4: Run the state tests to verify they pass**

Run: `bun test apps/server/src/sidecars/discord-gateway/runner-state.test.ts`
Expected: PASS

### Task 2: Extract Pure Runner Core

**Files:**
- Create: `apps/server/src/sidecars/discord-gateway/runner-core.ts`
- Create: `apps/server/src/sidecars/discord-gateway/runner-core.test.ts`
- Modify: `apps/server/src/sidecars/discord-gateway/reconcile.ts`
- Modify: `apps/server/src/sidecars/discord-gateway/reconcile.test.ts`

- [ ] **Step 1: Write the failing core tests**

```ts
test("skips a start action when the same fingerprint is already blocked", async () => {
  const { planDiscordGatewayReconcile } = await import("./runner-core");

  const result = planDiscordGatewayReconcile({
    state: blockedState,
    desired: new Map([
      ["profile-1", desiredSpec],
    ]),
  });

  expect(result.actions).toEqual([]);
});
```

- [ ] **Step 2: Run the core tests to verify they fail**

Run: `bun test apps/server/src/sidecars/discord-gateway/runner-core.test.ts apps/server/src/sidecars/discord-gateway/reconcile.test.ts`
Expected: FAIL because `runner-core.ts` does not exist.

- [ ] **Step 3: Implement pure core helpers**

```ts
const classifyDiscordGatewayStartupError = (message: string) =>
  DISCORD_GATEWAY_FATAL_ERROR_PATTERNS.some((pattern) => pattern.test(message))
    ? "fatal"
    : "retryable";

const planDiscordGatewayReconcile = (input: {
  state: DiscordGatewayRunnerState;
  desired: Map<string, DiscordGatewaySessionSpec>;
}) => {
  const nextState = clearObsoleteBlockedSessions(input.state, input.desired);
  const actions = diffDiscordGatewaySessions({
    running: selectDiscordGatewayRunningSessions(nextState),
    desired: input.desired,
  }).filter((action) =>
    action.type !== "start" || !isBlockedForFingerprint(nextState, action.spec));

  return {
    nextState,
    actions,
  };
};
```

- [ ] **Step 4: Simplify reconcile diff to accept pure running specs**

```ts
const diffDiscordGatewaySessions = (input: {
  running: Map<string, DiscordGatewayRunningSession>;
  desired: Map<string, DiscordGatewaySessionSpec>;
}) => { /* same diff logic without controller registry entries */ };
```

- [ ] **Step 5: Run the core tests to verify they pass**

Run: `bun test apps/server/src/sidecars/discord-gateway/runner-core.test.ts apps/server/src/sidecars/discord-gateway/reconcile.test.ts`
Expected: PASS

### Task 3: Replace Mutable Heartbeat State With Pure Selectors

**Files:**
- Create: `apps/server/src/sidecars/discord-gateway/runner-selectors.ts`
- Create: `apps/server/src/sidecars/discord-gateway/runner-selectors.test.ts`
- Delete: `apps/server/src/sidecars/discord-gateway/heartbeat-state.ts`
- Delete: `apps/server/src/sidecars/discord-gateway/heartbeat-state.test.ts`

- [ ] **Step 1: Write the failing selector tests**

```ts
test("projects a blocked session into a degraded heartbeat session", async () => {
  const { selectDiscordGatewayHeartbeat } = await import("./runner-selectors");

  expect(selectDiscordGatewayHeartbeat({
    state: blockedState,
    heartbeatIntervalMs: 10_000,
    reconcileIntervalMs: 30_000,
    now: "2026-07-02T10:00:10.000Z",
  })).toMatchObject({
    lastReconcileStatus: "error",
    sessions: [
      expect.objectContaining({
        profileId: "profile-1",
        status: "degraded",
      }),
    ],
  });
});
```

- [ ] **Step 2: Run the selector tests to verify they fail**

Run: `bun test apps/server/src/sidecars/discord-gateway/runner-selectors.test.ts`
Expected: FAIL because `runner-selectors.ts` does not exist.

- [ ] **Step 3: Implement the selectors**

```ts
const selectDiscordGatewayHeartbeat = (input: {
  state: DiscordGatewayRunnerState;
  heartbeatIntervalMs: number;
  reconcileIntervalMs: number;
  now: string;
}): DiscordGatewaySidecarHeartbeat => ({
  enabled: input.state.enabled,
  startedAt: input.state.startedAt,
  observedAt: input.now,
  heartbeatIntervalMs: input.heartbeatIntervalMs,
  reconcileIntervalMs: input.reconcileIntervalMs,
  lastReconcileAt: input.state.lastReconcileAt,
  lastReconcileStatus: input.state.lastReconcileStatus,
  lastReconcileErrorMessage: input.state.lastReconcileErrorMessage,
  sessions: projectSessions(input.state.sessions),
});
```

- [ ] **Step 4: Run the selector tests to verify they pass**

Run: `bun test apps/server/src/sidecars/discord-gateway/runner-selectors.test.ts`
Expected: PASS

### Task 4: Collapse `runner.ts` Into An Imperative Shell

**Files:**
- Modify: `apps/server/src/sidecars/discord-gateway/runner.ts`
- Modify: `apps/server/src/sidecars/discord-gateway/runner.test.ts`

- [ ] **Step 1: Write the failing runner shell tests**

```ts
test("does not re-attempt controller.start on the next reconcile after a fatal startup error", async () => {
  const { createDiscordGatewayRunner } = await import("./runner");
  const runner = createDiscordGatewayRunner(/* existing test harness */);

  await runner.start();
  await reconcileTick();

  expect(fatalStartMock).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the runner tests to verify they fail for the shell rewrite**

Run: `bun test apps/server/src/sidecars/discord-gateway/runner.test.ts`
Expected: FAIL while `runner.ts` still depends on removed mutable heartbeat state.

- [ ] **Step 3: Rewrite the shell around state + dispatch + selectors**

```ts
let state = createInitialDiscordGatewayRunnerState({
  enabled: input.runtimeConfig.enabled,
  startedAt: effectiveDeps.now(),
});
const controllers = new Map<string, DiscordGatewayControllerEntry>();

const dispatch = (event: DiscordGatewayRunnerEvent) => {
  state = applyDiscordGatewayRunnerEvent(state, event);
};

const publishHeartbeat = async () => {
  if (!input.publishHeartbeat) return;

  await input.publishHeartbeat(selectDiscordGatewayHeartbeat({
    state,
    heartbeatIntervalMs: input.runtimeConfig.heartbeatIntervalMs,
    reconcileIntervalMs: input.runtimeConfig.reconcileIntervalMs,
    now: effectiveDeps.now(),
  }));
};
```

- [ ] **Step 4: Run the runner tests to verify they pass**

Run: `bun test apps/server/src/sidecars/discord-gateway/runner.test.ts`
Expected: PASS

### Task 5: Full Verification

**Files:**
- Modify: `docs/superpowers/specs/2026-07-02-discord-gateway-runner-fp-refactor-design.md`

- [ ] **Step 1: Run the focused Discord suite**

Run: `bun test apps/server/src/sidecars/discord-gateway/*.test.ts apps/server/src/runtime/discord-gateway-sidecar-monitor.test.ts apps/server/src/routes/runtime-discord-gateway.test.ts apps/server/src/routes/integrations-discord-internal.test.ts apps/server/src/integrations/discord-gateway-normalize.test.ts apps/server/src/integrations/discord-inbound.test.ts apps/server/src/routes/integrations-discord.test.ts`
Expected: PASS

- [ ] **Step 2: Run server typecheck**

Run: `bun run typecheck:server`
Expected: PASS

- [ ] **Step 3: Update the design doc status**

```md
> 状态：implemented
```
