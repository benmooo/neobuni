import { call } from "@orpc/server";
import { Effect } from "effect";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { captureOrpcError, createTestContext } from "./test-support";

interface PersistedTaskRun {
  attempt: number;
  createdAt: string;
  error: Record<string, unknown> | null;
  finishedAt: string | null;
  heartbeatAt: string | null;
  id: string;
  inputSnapshot: Record<string, unknown> | null;
  leaseExpiresAt: string | null;
  leaseOwner: string | null;
  maxAttempts: number;
  nextRetryAt: string | null;
  profileId: string;
  promptSnapshot: string;
  result: Record<string, unknown> | null;
  runtimeTurnId: string | null;
  scheduledFor: string;
  scheduleId: string;
  startedAt: string | null;
  status:
    | "queued"
    | "claimed"
    | "running"
    | "succeeded"
    | "failed"
    | "retry_scheduled"
    | "cancelled";
  toolPolicySnapshot: Record<string, unknown> | null;
  updatedAt: string;
}

interface PersistedRuntimeTurn {
  conversationId: string | null;
  createdAt: string;
  durationMs: number | null;
  endedAt: string | null;
  errorCode: string | null;
  errorJson: Record<string, unknown> | null;
  executionSource: "chat" | "task_run";
  hadToolFailures: boolean;
  hadToolRecall: boolean;
  id: string;
  memoryCount: number;
  memoryRecallStrategy: "pre_recall" | "tool_fallback" | "skip" | null;
  modelKey: string;
  preRecallCount: number;
  primaryStance: string | null;
  profileId: string;
  protectiveLevel: number | null;
  providerKey: string;
  requestMessageId: string | null;
  responseMessageId: string | null;
  startedAt: string;
  status: "running" | "completed" | "failed" | "aborted";
  taskRunId: string | null;
  toolCallCount: number;
  updatedAt: string;
}

interface PersistedRuntimeSpan {
  conversationId: string | null;
  durationMs: number | null;
  endedAt: string | null;
  error: Record<string, unknown> | null;
  id: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  seq: number;
  stage:
    | "request_received"
    | "prompt_compile"
    | "provider_stream"
    | "tool_call"
    | "turn_finalize";
  startedAt: string;
  status: "running" | "completed" | "failed" | "skipped";
  turnId: string;
}

const makeTaskRun = (
  overrides: Partial<PersistedTaskRun> = {}
): PersistedTaskRun => ({
  id: "task-run-1",
  profileId: "profile-route-1",
  scheduleId: "schedule-1",
  status: "succeeded",
  scheduledFor: "2026-06-01T00:00:00.000Z",
  promptSnapshot: "Run review",
  toolPolicySnapshot: null,
  inputSnapshot: null,
  attempt: 1,
  maxAttempts: 3,
  leaseOwner: null,
  leaseExpiresAt: null,
  heartbeatAt: null,
  nextRetryAt: null,
  runtimeTurnId: "turn-1",
  result: {
    assistantText: "done",
  },
  error: null,
  createdAt: "2026-05-30T00:00:00.000Z",
  startedAt: "2026-06-01T00:00:00.000Z",
  finishedAt: "2026-06-01T00:00:04.000Z",
  updatedAt: "2026-06-01T00:00:04.000Z",
  ...overrides,
});

const makeRuntimeTurn = (
  overrides: Partial<PersistedRuntimeTurn> = {}
): PersistedRuntimeTurn => ({
  id: "turn-1",
  profileId: "profile-route-1",
  conversationId: null,
  executionSource: "task_run",
  taskRunId: "task-run-1",
  requestMessageId: null,
  responseMessageId: null,
  status: "completed",
  startedAt: "2026-06-01T00:00:00.000Z",
  endedAt: "2026-06-01T00:00:04.000Z",
  durationMs: 4000,
  providerKey: "openai",
  modelKey: "gpt-5",
  protectiveLevel: null,
  primaryStance: null,
  memoryCount: 0,
  memoryRecallStrategy: "skip",
  preRecallCount: 0,
  toolCallCount: 1,
  hadToolFailures: false,
  hadToolRecall: false,
  errorCode: null,
  errorJson: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:04.000Z",
  ...overrides,
});

const makeRuntimeSpan = (
  overrides: Partial<PersistedRuntimeSpan> = {}
): PersistedRuntimeSpan => ({
  id: "span-1",
  turnId: "turn-1",
  conversationId: null,
  stage: "provider_stream",
  seq: 0,
  status: "completed",
  startedAt: "2026-06-01T00:00:00.000Z",
  endedAt: "2026-06-01T00:00:03.000Z",
  durationMs: 3000,
  input: {
    taskRunId: "task-run-1",
  },
  output: {
    providerOutcome: "completed",
  },
  error: null,
  ...overrides,
});

const mocks = vi.hoisted(() => ({
  getRuntimeTurn: vi.fn(),
  getTaskRun: vi.fn(),
  listRuntimeSpansByTurn: vi.fn(),
}));

vi.mock("@neobuni/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@neobuni/db")>();
  return {
    ...actual,
    getRuntimeTurn: mocks.getRuntimeTurn,
    getTaskRun: mocks.getTaskRun,
    listRuntimeSpansByTurn: mocks.listRuntimeSpansByTurn,
  };
});

const { taskRunsRouter } = await import("@neobuni/api/routers/task-runs");

describe("task-run routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTaskRun.mockReturnValue(Effect.succeed(makeTaskRun()));
    mocks.getRuntimeTurn.mockReturnValue(Effect.succeed(makeRuntimeTurn()));
    mocks.listRuntimeSpansByTurn.mockReturnValue(
      Effect.succeed([makeRuntimeSpan()])
    );
  });

  test("returns one task run", async () => {
    const data = await call(
      taskRunsRouter.get,
      { taskRunId: "task-run-1" },
      { context: createTestContext("profile-route-1") }
    );

    expect(data).toMatchObject({
      id: "task-run-1",
      scheduleId: "schedule-1",
      status: "succeeded",
    });
  });

  test("returns task run plus runtime trace", async () => {
    const data = await call(
      taskRunsRouter.trace,
      { taskRunId: "task-run-1" },
      { context: createTestContext("profile-route-1") }
    );

    const getRuntimeTurnCall = mocks.getRuntimeTurn.mock.calls[0] as
      | unknown[]
      | undefined;
    const listRuntimeSpansCall = mocks.listRuntimeSpansByTurn.mock.calls[0] as
      | unknown[]
      | undefined;
    expect(getRuntimeTurnCall?.[0]).toBe("turn-1");
    expect(listRuntimeSpansCall?.[0]).toBe("turn-1");

    expect(data).toMatchObject({
      taskRun: {
        id: "task-run-1",
      },
      runtimeTurn: {
        id: "turn-1",
        taskRunId: "task-run-1",
      },
    });
    expect(data.spans).toHaveLength(1);
  });

  test("returns 404 for another profile", async () => {
    mocks.getTaskRun.mockReturnValue(
      Effect.succeed(makeTaskRun({ profileId: "profile-other" }))
    );

    const error = await captureOrpcError(() =>
      call(
        taskRunsRouter.get,
        { taskRunId: "task-run-1" },
        { context: createTestContext("profile-route-1") }
      )
    );

    expect(error.code).toBe("NOT_FOUND");
  });
});
