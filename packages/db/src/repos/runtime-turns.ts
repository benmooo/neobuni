import { makeRuntimeTurn } from "@neobuni/core";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";

import { db, fromPromise } from "../client";
import { runtimeTurnsTable } from "../schema";
import { failRuntimeSpan, listRuntimeSpansByTurn } from "./runtime-spans";

const createRuntimeTurnRecord = makeRuntimeTurn();

const parseJson = (value: string | null) => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const toRuntimeTurn = (row: typeof runtimeTurnsTable.$inferSelect) => ({
  id: row.id,
  profileId: row.profileId,
  conversationId: row.conversationId,
  executionSource: row.executionSource as "chat" | "task_run",
  taskRunId: row.taskRunId,
  requestMessageId: row.requestMessageId,
  responseMessageId: row.responseMessageId,
  status: row.status as "running" | "completed" | "failed" | "aborted",
  startedAt: row.startedAt,
  endedAt: row.endedAt,
  durationMs: row.durationMs,
  providerKey: row.providerKey,
  modelKey: row.modelKey,
  protectiveLevel: row.protectiveLevel,
  primaryStance: row.primaryStance,
  memoryCount: row.memoryCount,
  memoryRecallStrategy: row.memoryRecallStrategy as
    | "pre_recall"
    | "tool_fallback"
    | "skip"
    | null,
  preRecallCount: row.preRecallCount,
  toolCallCount: row.toolCallCount,
  hadToolFailures: row.hadToolFailures === 1,
  hadToolRecall: row.hadToolRecall === 1,
  errorCode: row.errorCode,
  errorJson: parseJson(row.errorJson),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const createRuntimeTurn = Effect.fnUntraced(function* (input: {
  profileId: string;
  conversationId?: string | null;
  providerKey: string;
  modelKey: string;
  executionSource?: "chat" | "task_run";
  taskRunId?: string | null;
}) {
  const record = createRuntimeTurnRecord(input);
  yield* fromPromise("createRuntimeTurn", () =>
    db.insert(runtimeTurnsTable).values(record)
  );
  return toRuntimeTurn(record);
});

export const getRuntimeTurn = Effect.fnUntraced(function* (turnId: string) {
  const row = yield* fromPromise("getRuntimeTurn", () =>
    db.query.runtimeTurnsTable.findFirst({
      where: { id: turnId },
    })
  );

  return row ? toRuntimeTurn(row) : null;
});

export const listRuntimeTurnsByConversation = Effect.fnUntraced(function* (
  profileId: string,
  conversationId: string
) {
  const rows = yield* fromPromise("listRuntimeTurnsByConversation", () =>
    db.query.runtimeTurnsTable.findMany({
      where: {
        profileId,
        conversationId,
      },
      orderBy: { createdAt: "desc" },
    })
  );

  return rows.map(toRuntimeTurn);
});

export const listRecentRuntimeTurns = Effect.fnUntraced(function* (
  profileId: string,
  input?: {
    statuses?: Array<"running" | "completed" | "failed" | "aborted">;
    limit?: number;
  }
) {
  const filters = [
    eq(runtimeTurnsTable.profileId, profileId),
    ...(input?.statuses && input.statuses.length > 0
      ? [inArray(runtimeTurnsTable.status, input.statuses)]
      : []),
  ];

  const query = db
    .select()
    .from(runtimeTurnsTable)
    .where(and(...filters))
    .orderBy(
      desc(runtimeTurnsTable.createdAt),
      desc(runtimeTurnsTable.startedAt)
    );

  const rows = yield* fromPromise("listRecentRuntimeTurns", async () =>
    input?.limit === undefined ? await query : await query.limit(input.limit)
  );

  return rows.map(toRuntimeTurn);
});

export const listRunningRuntimeTurns = Effect.fnUntraced(function* () {
  const rows = yield* fromPromise("listRunningRuntimeTurns", () =>
    db
      .select()
      .from(runtimeTurnsTable)
      .where(eq(runtimeTurnsTable.status, "running"))
      .orderBy(
        asc(runtimeTurnsTable.createdAt),
        asc(runtimeTurnsTable.startedAt)
      )
  );

  return rows.map(toRuntimeTurn);
});

export const updateRuntimeTurn = Effect.fnUntraced(function* (
  turnId: string,
  patch: Partial<typeof runtimeTurnsTable.$inferInsert>
) {
  yield* fromPromise("updateRuntimeTurn", () =>
    db
      .update(runtimeTurnsTable)
      .set(patch)
      .where(eq(runtimeTurnsTable.id, turnId))
  );
  const row = yield* fromPromise("updateRuntimeTurn", () =>
    db.query.runtimeTurnsTable.findFirst({
      where: { id: turnId },
    })
  );
  return row ? toRuntimeTurn(row) : null;
});

export const attachRuntimeTurnMessages = Effect.fnUntraced(function* (
  turnId: string,
  input: { requestMessageId?: string | null; responseMessageId?: string | null }
) {
  const patch: Partial<typeof runtimeTurnsTable.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };

  if (input.requestMessageId !== undefined) {
    patch.requestMessageId = input.requestMessageId;
  }

  if (input.responseMessageId !== undefined) {
    patch.responseMessageId = input.responseMessageId;
  }

  return yield* updateRuntimeTurn(turnId, {
    ...patch,
  });
});

export const completeRuntimeTurn = Effect.fnUntraced(function* (
  turnId: string,
  input: {
    protectiveLevel?: number | null;
    primaryStance?: string | null;
    memoryCount?: number;
    memoryRecallStrategy?: "pre_recall" | "tool_fallback" | "skip" | null;
    preRecallCount?: number;
    toolCallCount?: number;
    hadToolFailures?: boolean;
    hadToolRecall?: boolean;
  }
) {
  const existing = yield* getRuntimeTurn(turnId);
  if (!existing) {
    return null;
  }

  const endedAt = new Date().toISOString();
  const durationMs = Math.max(
    0,
    new Date(endedAt).getTime() - new Date(existing.startedAt).getTime()
  );

  return yield* updateRuntimeTurn(turnId, {
    status: "completed",
    endedAt,
    durationMs,
    protectiveLevel: input.protectiveLevel ?? existing.protectiveLevel,
    primaryStance: input.primaryStance ?? existing.primaryStance,
    memoryCount: input.memoryCount ?? existing.memoryCount,
    memoryRecallStrategy:
      input.memoryRecallStrategy ?? existing.memoryRecallStrategy,
    preRecallCount: input.preRecallCount ?? existing.preRecallCount,
    toolCallCount: input.toolCallCount ?? existing.toolCallCount,
    hadToolFailures:
      input.hadToolFailures === undefined
        ? existing.hadToolFailures
          ? 1
          : 0
        : input.hadToolFailures
          ? 1
          : 0,
    hadToolRecall:
      input.hadToolRecall === undefined
        ? existing.hadToolRecall
          ? 1
          : 0
        : input.hadToolRecall
          ? 1
          : 0,
    updatedAt: endedAt,
  });
});

export const failRuntimeTurn = Effect.fnUntraced(function* (
  turnId: string,
  input: {
    errorCode: string;
    error?: Record<string, unknown>;
    protectiveLevel?: number | null;
    primaryStance?: string | null;
    memoryCount?: number;
    memoryRecallStrategy?: "pre_recall" | "tool_fallback" | "skip" | null;
    preRecallCount?: number;
    toolCallCount?: number;
    hadToolFailures?: boolean;
    hadToolRecall?: boolean;
  }
) {
  const existing = yield* getRuntimeTurn(turnId);
  if (!existing) {
    return null;
  }

  const endedAt = new Date().toISOString();
  const durationMs = Math.max(
    0,
    new Date(endedAt).getTime() - new Date(existing.startedAt).getTime()
  );

  return yield* updateRuntimeTurn(turnId, {
    status: "failed",
    endedAt,
    durationMs,
    errorCode: input.errorCode,
    errorJson: JSON.stringify(input.error ?? {}),
    protectiveLevel: input.protectiveLevel ?? existing.protectiveLevel,
    primaryStance: input.primaryStance ?? existing.primaryStance,
    memoryCount: input.memoryCount ?? existing.memoryCount,
    memoryRecallStrategy:
      input.memoryRecallStrategy ?? existing.memoryRecallStrategy,
    preRecallCount: input.preRecallCount ?? existing.preRecallCount,
    toolCallCount: input.toolCallCount ?? existing.toolCallCount,
    hadToolFailures:
      input.hadToolFailures === undefined
        ? existing.hadToolFailures
          ? 1
          : 0
        : input.hadToolFailures
          ? 1
          : 0,
    hadToolRecall:
      input.hadToolRecall === undefined
        ? existing.hadToolRecall
          ? 1
          : 0
        : input.hadToolRecall
          ? 1
          : 0,
    updatedAt: endedAt,
  });
});

export const abortRuntimeTurn = Effect.fnUntraced(function* (
  turnId: string,
  input?: {
    error?: Record<string, unknown>;
    memoryRecallStrategy?: "pre_recall" | "tool_fallback" | "skip" | null;
    preRecallCount?: number;
    toolCallCount?: number;
    hadToolFailures?: boolean;
    hadToolRecall?: boolean;
  }
) {
  const existing = yield* getRuntimeTurn(turnId);
  if (!existing) {
    return null;
  }

  const endedAt = new Date().toISOString();
  const durationMs = Math.max(
    0,
    new Date(endedAt).getTime() - new Date(existing.startedAt).getTime()
  );

  return yield* updateRuntimeTurn(turnId, {
    status: "aborted",
    endedAt,
    durationMs,
    errorCode: "aborted",
    errorJson: input?.error
      ? JSON.stringify(input.error)
      : existing.errorJson
        ? JSON.stringify(existing.errorJson)
        : null,
    memoryRecallStrategy:
      input?.memoryRecallStrategy ?? existing.memoryRecallStrategy,
    preRecallCount: input?.preRecallCount ?? existing.preRecallCount,
    toolCallCount: input?.toolCallCount ?? existing.toolCallCount,
    hadToolFailures:
      input?.hadToolFailures === undefined
        ? existing.hadToolFailures
          ? 1
          : 0
        : input.hadToolFailures
          ? 1
          : 0,
    hadToolRecall:
      input?.hadToolRecall === undefined
        ? existing.hadToolRecall
          ? 1
          : 0
        : input.hadToolRecall
          ? 1
          : 0,
    updatedAt: endedAt,
  });
});

export const cleanupRunningRuntimeTurns = Effect.fnUntraced(function* (input?: {
  status?: "aborted" | "failed";
  reason?: string;
  errorCode?: string;
}) {
  const status = input?.status ?? "aborted";
  const reason = input?.reason ?? "runtime_recovery_cleanup";
  const errorCode =
    input?.errorCode ??
    (status === "failed" ? "runtime_turn_recovered" : "aborted");
  const runningTurns = yield* listRunningRuntimeTurns();

  let cleanedSpanCount = 0;
  const cleanedTurnIds: string[] = [];

  for (const turn of runningTurns) {
    const spans = yield* listRuntimeSpansByTurn(turn.id);
    const runningSpans = spans.filter((span) => span.status === "running");

    for (const span of runningSpans) {
      yield* failRuntimeSpan(span.id, {
        cleanup: true,
        reason,
        turnStatus: status,
        turnId: turn.id,
        stage: span.stage,
        errorCode,
      });
      cleanedSpanCount += 1;
    }

    const cleanupError = {
      cleanup: true,
      reason,
      recoveredFromStatus: "running",
      recoveredAt: new Date().toISOString(),
      turnId: turn.id,
      conversationId: turn.conversationId,
      providerKey: turn.providerKey,
      modelKey: turn.modelKey,
    };

    if (status === "failed") {
      yield* failRuntimeTurn(turn.id, {
        errorCode,
        error: cleanupError,
      });
    } else {
      yield* abortRuntimeTurn(turn.id, {
        error: cleanupError,
      });
    }

    cleanedTurnIds.push(turn.id);
  }

  return {
    status,
    reason,
    turnCount: cleanedTurnIds.length,
    spanCount: cleanedSpanCount,
    turnIds: cleanedTurnIds,
  };
});
