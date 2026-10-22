import { DbError, runRepo } from "@neobuni/db";
import { Effect } from "effect";
import { describe, expect, test } from "vitest";

import { buildFallbackPrompt, materializeDueSchedule } from "./materialize";

const makeSchedule = (
  overrides: Partial<{
    id: string;
    profileId: string;
    type: "reminder" | "alarm" | "monitor";
    title: string;
    content: string;
    triggerAt: string | null;
    cronExpr: string | null;
    timezone: string;
    status: "active" | "paused" | "completed" | "cancelled";
    lastTriggeredAt: string | null;
    deliveredAt: string | null;
    lastMaterializedAt: string | null;
    metadata: Record<string, unknown>;
    blueprint: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
  }> = {},
) => ({
  id: overrides.id ?? "schedule-1",
  profileId: overrides.profileId ?? "profile-1",
  type: overrides.type ?? "reminder",
  title: overrides.title ?? "Morning task",
  content: overrides.content ?? "Do the task",
  triggerAt: overrides.triggerAt === undefined ? "2026-06-01T08:00:00.000Z" : overrides.triggerAt,
  cronExpr: overrides.cronExpr === undefined ? "0 8 * * *" : overrides.cronExpr,
  timezone: overrides.timezone ?? "UTC",
  status: overrides.status ?? "active",
  lastTriggeredAt: overrides.lastTriggeredAt ?? null,
  deliveredAt: overrides.deliveredAt ?? null,
  lastMaterializedAt: overrides.lastMaterializedAt ?? null,
  metadata: overrides.metadata ?? {},
  blueprint: overrides.blueprint ?? null,
  createdAt: overrides.createdAt ?? "2026-06-01T00:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2026-06-01T00:00:00.000Z",
});

describe("materializeDueSchedule", () => {
  test("creates a task_run from schedule blueprint and advances recurring triggerAt", async () => {
    const captured: {
      taskRunInput?: Record<string, unknown>;
      schedulePatch?: Record<string, unknown>;
      eventPayload?: Record<string, unknown>;
    } = {};

    const result = await runRepo(
      materializeDueSchedule({
        nowIso: "2026-06-01T09:00:00.000Z",
        schedule: makeSchedule({
          blueprint: {
            version: 1,
            prompt: "Fetch the latest headlines and send a summary.",
            toolAllowlist: ["get_news_headlines", "send_channel_message"],
            maxSteps: 4,
            timeoutMs: 120000,
            deliveryIntent: {
              conversationId: null,
              channelTarget: {
                platform: "telegram",
                targetAlias: "team-news",
                targetId: null,
              },
            },
            input: {
              provider: "newsnow",
            },
          },
        }),
        deps: {
          createTaskRun: (input) => {
            captured.taskRunInput = input as unknown as Record<string, unknown>;
            return Effect.succeed({
              id: "task-run-1",
            } as never);
          },
          updateSchedule: (_scheduleId, patch) => {
            captured.schedulePatch = patch as unknown as Record<string, unknown>;
            return Effect.succeed(
              makeSchedule({
                triggerAt: patch.triggerAt ?? null,
                status: patch.status ?? "active",
                lastMaterializedAt: patch.lastMaterializedAt ?? null,
              }) as never,
            );
          },
          appendEvent: (_profileId, _type, payload) => {
            captured.eventPayload = payload;
            return Effect.succeed({
              id: "event-1",
            } as never);
          },
        },
      }),
    );

    expect(result).toEqual({
      scheduleId: "schedule-1",
      taskRunId: "task-run-1",
      scheduledFor: "2026-06-01T08:00:00.000Z",
      materialized: true,
      nextTriggerAt: "2026-06-02T08:00:00.000Z",
      completed: false,
    });
    expect(captured.taskRunInput).toMatchObject({
      profileId: "profile-1",
      scheduleId: "schedule-1",
      scheduledFor: "2026-06-01T08:00:00.000Z",
      inputSnapshot: {
        deliveryIntent: {
          conversationId: null,
          channelTarget: {
            platform: "telegram",
            targetAlias: "team-news",
            targetId: null,
          },
        },
      },
      toolPolicySnapshot: {
        toolAllowlist: ["get_news_headlines", "send_channel_message"],
        maxSteps: 4,
        timeoutMs: 120000,
      },
    });
    expect(String(captured.taskRunInput?.promptSnapshot ?? "")).toContain(
      "This scheduled task is due now.",
    );
    expect(String(captured.taskRunInput?.promptSnapshot ?? "")).toContain(
      "Fetch the latest headlines and send a summary.",
    );
    expect(String(captured.taskRunInput?.promptSnapshot ?? "")).toContain(
      "Do not create, update, delete, or request another schedule",
    );
    expect(captured.schedulePatch).toEqual({
      triggerAt: "2026-06-02T08:00:00.000Z",
      status: "active",
      lastMaterializedAt: "2026-06-01T09:00:00.000Z",
    });
    expect(captured.eventPayload).toMatchObject({
      scheduleId: "schedule-1",
      taskRunId: "task-run-1",
      completed: false,
    });
  });

  test("falls back to reminder prompt and completes one-shot schedules after materialization", async () => {
    const schedule = makeSchedule({
      title: "One-shot reminder",
      content: "Send the user a reminder.",
      triggerAt: "2026-06-01T10:00:00.000Z",
      cronExpr: null,
      blueprint: null,
    });

    const fallbackPrompt = buildFallbackPrompt(schedule as never);
    let schedulePatch: Record<string, unknown> | undefined;

    const result = await runRepo(
      materializeDueSchedule({
        nowIso: "2026-06-01T10:05:00.000Z",
        schedule: schedule as never,
        deps: {
          createTaskRun: (input) => {
            expect(input.promptSnapshot).toBe(fallbackPrompt);
            return Effect.succeed({
              id: "task-run-2",
            } as never);
          },
          updateSchedule: (_scheduleId, patch) => {
            schedulePatch = patch as unknown as Record<string, unknown>;
            return Effect.succeed(
              makeSchedule({
                cronExpr: null,
                triggerAt: null,
                status: "completed",
                lastMaterializedAt: patch.lastMaterializedAt ?? null,
              }) as never,
            );
          },
          appendEvent: () => Effect.succeed({ id: "event-2" } as never),
        },
      }),
    );

    expect(result).toEqual({
      scheduleId: "schedule-1",
      taskRunId: "task-run-2",
      scheduledFor: "2026-06-01T10:00:00.000Z",
      materialized: true,
      nextTriggerAt: null,
      completed: true,
    });
    expect(schedulePatch).toEqual({
      triggerAt: null,
      status: "completed",
      lastMaterializedAt: "2026-06-01T10:05:00.000Z",
    });
  });

  test("hardens the default materialized tool policy when blueprint has no explicit allowlist", async () => {
    let taskRunInput: Record<string, unknown> | undefined;

    await runRepo(
      materializeDueSchedule({
        nowIso: "2026-06-13T08:02:00.000Z",
        schedule: makeSchedule({
          type: "alarm",
          title: "Send a Feishu message",
          content: "test message",
          triggerAt: "2026-06-13T08:01:55.636Z",
          cronExpr: null,
          timezone: "Asia/Shanghai",
          metadata: {
            source: "chat_tool",
            conversationId: "conversation-1",
          },
          blueprint: {
            version: 1,
            prompt: "等待到触发时间后，向 Telegram 目标别名 hermes0 发送文本消息：test message。",
            toolAllowlist: null,
            maxSteps: null,
            timeoutMs: null,
            deliveryIntent: {
              conversationId: null,
              channelTarget: {
                platform: "telegram",
                targetAlias: "hermes0",
                targetId: null,
              },
            },
            input: null,
          },
        }),
        deps: {
          createTaskRun: (input) => {
            taskRunInput = input as unknown as Record<string, unknown>;
            return Effect.succeed({
              id: "task-run-3",
            } as never);
          },
          updateSchedule: (_scheduleId, patch) =>
            Effect.succeed(
              makeSchedule({
                type: "alarm",
                cronExpr: null,
                triggerAt: patch.triggerAt ?? null,
                status: patch.status ?? "completed",
                lastMaterializedAt: patch.lastMaterializedAt ?? null,
              }) as never,
            ),
          appendEvent: () => Effect.succeed({ id: "event-4" } as never),
        },
      }),
    );

    const promptSnapshot = String(taskRunInput?.promptSnapshot ?? "");
    const toolPolicySnapshot = taskRunInput?.toolPolicySnapshot as
      | {
          toolAllowlist?: string[] | null;
        }
      | null
      | undefined;
    const toolAllowlist = toolPolicySnapshot?.toolAllowlist ?? null;

    expect(promptSnapshot).toContain("This scheduled task is due now.");
    expect(promptSnapshot).toContain("Execute the task now instead of scheduling it again.");
    expect(promptSnapshot).toContain(
      "等待到触发时间后，向 Telegram 目标别名 hermes0 发送文本消息：test message。",
    );
    expect(Array.isArray(toolAllowlist)).toBe(true);
    expect(toolAllowlist?.includes("send_channel_message")).toBe(true);
    expect(toolAllowlist?.includes("create_schedule")).toBe(false);
    expect(toolAllowlist?.includes("create_reminder")).toBe(false);
    expect(toolAllowlist?.includes("update_schedule")).toBe(false);
    expect(toolAllowlist?.includes("delete_schedule")).toBe(false);
  });

  test("treats duplicate task_run creation as an idempotent already-materialized slot", async () => {
    let lookupCalled = false;

    const result = await runRepo(
      materializeDueSchedule({
        nowIso: "2026-06-01T09:00:00.000Z",
        schedule: makeSchedule(),
        deps: {
          createTaskRun: () =>
            Effect.fail(
              new DbError({
                operation: "createTaskRun",
                cause: new Error(
                  "UNIQUE constraint failed: task_runs.schedule_id, task_runs.scheduled_for",
                ),
              }),
            ),
          getTaskRunByScheduleAndScheduledFor: () => {
            lookupCalled = true;
            return Effect.succeed({
              id: "task-run-existing",
            } as never);
          },
          updateSchedule: (_scheduleId, patch) =>
            Effect.succeed(
              makeSchedule({
                triggerAt: patch.triggerAt ?? null,
                status: patch.status ?? "active",
                lastMaterializedAt: patch.lastMaterializedAt ?? null,
              }) as never,
            ),
          appendEvent: () => Effect.succeed({ id: "event-3" } as never),
        },
      }),
    );

    expect(lookupCalled).toBe(true);
    expect(result).toEqual({
      scheduleId: "schedule-1",
      taskRunId: "task-run-existing",
      scheduledFor: "2026-06-01T08:00:00.000Z",
      materialized: true,
      nextTriggerAt: "2026-06-02T08:00:00.000Z",
      completed: false,
    });
  });
});
