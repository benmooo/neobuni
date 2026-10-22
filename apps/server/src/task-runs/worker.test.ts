import { runRepo } from "@neobuni/db";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import { executeClaimedTaskRun } from "./worker";

const makeTaskRun = (
  overrides: Partial<{
    id: string;
    profileId: string;
    scheduleId: string;
    status:
      | "queued"
      | "claimed"
      | "running"
      | "succeeded"
      | "failed"
      | "retry_scheduled"
      | "cancelled";
    scheduledFor: string;
    promptSnapshot: string;
    toolPolicySnapshot: Record<string, unknown> | null;
    inputSnapshot: Record<string, unknown> | null;
    attempt: number;
    maxAttempts: number;
    leaseOwner: string | null;
    leaseExpiresAt: string | null;
    heartbeatAt: string | null;
    nextRetryAt: string | null;
    runtimeTurnId: string | null;
    result: Record<string, unknown> | null;
    error: Record<string, unknown> | null;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    updatedAt: string;
  }> = {},
) => ({
  id: overrides.id ?? "task-run-1",
  profileId: overrides.profileId ?? "profile-1",
  scheduleId: overrides.scheduleId ?? "schedule-1",
  status: overrides.status ?? "queued",
  scheduledFor: overrides.scheduledFor ?? "2026-06-01T08:00:00.000Z",
  promptSnapshot: overrides.promptSnapshot ?? "Fetch data and send it.",
  toolPolicySnapshot: overrides.toolPolicySnapshot ?? {
    toolAllowlist: ["send_chat_message"],
    timeoutMs: 120000,
  },
  inputSnapshot: overrides.inputSnapshot ?? {
    deliveryIntent: {
      conversationId: "conversation-1",
    },
  },
  attempt: overrides.attempt ?? 0,
  maxAttempts: overrides.maxAttempts ?? 3,
  leaseOwner: overrides.leaseOwner ?? null,
  leaseExpiresAt: overrides.leaseExpiresAt ?? null,
  heartbeatAt: overrides.heartbeatAt ?? null,
  nextRetryAt: overrides.nextRetryAt ?? null,
  runtimeTurnId: overrides.runtimeTurnId ?? null,
  result: overrides.result ?? null,
  error: overrides.error ?? null,
  createdAt: overrides.createdAt ?? "2026-06-01T07:00:00.000Z",
  startedAt: overrides.startedAt ?? null,
  finishedAt: overrides.finishedAt ?? null,
  updatedAt: overrides.updatedAt ?? "2026-06-01T07:00:00.000Z",
});

describe("executeClaimedTaskRun", () => {
  test("claims, runs, and completes a task run", async () => {
    const calls: string[] = [];

    const result = await runRepo(
      executeClaimedTaskRun({
        nowIso: "2026-06-01T09:00:00.000Z",
        workerId: "worker-1",
        config: {
          enabled: true,
          tickMs: 15000,
          limitPerProfile: 10,
          leaseMs: 60000,
          retryDelayMs: 60000,
          timeoutMs: 120000,
        },
        taskRun: makeTaskRun(),
        deps: {
          claimTaskRun: () => Effect.succeed(makeTaskRun() as never),
          startTaskRun: () =>
            Effect.sync(() => {
              calls.push("start");
              return makeTaskRun({ status: "queued", attempt: 1 }) as never;
            }),
          attachTaskRunRuntimeTurn: (_taskRunId, runtimeTurnId) =>
            Effect.sync(() => {
              calls.push(`attach:${runtimeTurnId}`);
              return makeTaskRun({ runtimeTurnId }) as never;
            }),
          runHeadlessTaskTurn: async (input) => {
            await input.onTurnCreated?.("turn-1");
            calls.push("run");
            return {
              runtimeTurnId: "turn-1",
              assistantText: "done",
              providerOutcome: "completed",
              transcript: null,
            };
          },
          completeTaskRun: () =>
            Effect.sync(() => {
              calls.push("complete");
              return makeTaskRun({ status: "succeeded" }) as never;
            }),
          appendEvent: (_profileId, type) =>
            Effect.sync(() => {
              calls.push(`event:${type}`);
              return { id: "event-1" } as never;
            }),
        },
      }),
    );

    expect(result).toEqual({
      claimed: true,
      succeeded: true,
      failed: false,
    });
    expect(calls).toEqual([
      "start",
      "event:task_run.started",
      "attach:turn-1",
      "run",
      "complete",
      "event:task_run.succeeded",
    ]);
  });

  test("schedules retry when the headless run fails", async () => {
    const calls: string[] = [];

    const result = await runRepo(
      executeClaimedTaskRun({
        nowIso: "2026-06-01T09:00:00.000Z",
        workerId: "worker-1",
        config: {
          enabled: true,
          tickMs: 15000,
          limitPerProfile: 10,
          leaseMs: 60000,
          retryDelayMs: 60000,
          timeoutMs: 120000,
        },
        taskRun: makeTaskRun(),
        deps: {
          claimTaskRun: () => Effect.succeed(makeTaskRun() as never),
          startTaskRun: () =>
            Effect.sync(() => {
              calls.push("start");
              return makeTaskRun({ attempt: 1 }) as never;
            }),
          runHeadlessTaskTurn: async () => {
            throw new Error("provider failed");
          },
          failTaskRun: () =>
            Effect.sync(() => {
              calls.push("fail");
              return makeTaskRun({ status: "retry_scheduled", attempt: 1 }) as never;
            }),
          appendEvent: (_profileId, type) =>
            Effect.sync(() => {
              calls.push(`event:${type}`);
              return { id: "event-1" } as never;
            }),
        },
      }),
    );

    expect(result).toEqual({
      claimed: true,
      succeeded: false,
      failed: true,
    });
    expect(calls).toEqual(["start", "event:task_run.started", "fail", "event:task_run.failed"]);
  });

  test("runs channel delivery schedules with a public-safe surface policy", async () => {
    let capturedSurface: string | null = null;

    const result = await runRepo(
      executeClaimedTaskRun({
        nowIso: "2026-06-01T09:00:00.000Z",
        workerId: "worker-1",
        config: {
          enabled: true,
          tickMs: 15000,
          limitPerProfile: 10,
          leaseMs: 60000,
          retryDelayMs: 60000,
          timeoutMs: 120000,
        },
        taskRun: makeTaskRun({
          inputSnapshot: {
            deliveryIntent: {
              conversationId: null,
              channelTarget: {
                platform: "telegram",
                targetId: "-1001234567890",
              },
            },
          },
        }),
        deps: {
          claimTaskRun: () =>
            Effect.succeed(
              makeTaskRun({
                inputSnapshot: {
                  deliveryIntent: {
                    conversationId: null,
                    channelTarget: {
                      platform: "telegram",
                      targetId: "-1001234567890",
                    },
                  },
                },
              }) as never,
            ),
          startTaskRun: () => Effect.succeed(makeTaskRun({ attempt: 1 }) as never),
          attachTaskRunRuntimeTurn: () => Effect.succeed(makeTaskRun() as never),
          runHeadlessTaskTurn: async (input) => {
            capturedSurface = input.surfacePolicy?.surface ?? null;
            await input.onTurnCreated?.("turn-1");
            return {
              runtimeTurnId: "turn-1",
              assistantText: "done",
              providerOutcome: "completed",
              transcript: null,
            };
          },
          completeTaskRun: () => Effect.succeed(makeTaskRun({ status: "succeeded" }) as never),
          appendEvent: () => Effect.succeed({ id: "event-1" } as never),
        },
      }),
    );

    expect(result).toEqual({
      claimed: true,
      succeeded: true,
      failed: false,
    });
    expect(capturedSurface ?? "").toBe("task_run_public_safe");
  });
});
