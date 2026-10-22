import {
  canStartDurableRun,
  isCancellableDurableRun,
  isClaimableDurableRun,
  makeCancellationPatch,
  makeClaimPatch,
  makeCompletionPatch,
  makeFailurePatch,
  makeStartPatch,
  makeTaskRun,
} from "@neobuni/core";
import { and, asc, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { Effect } from "effect";

import { db, fromPromise } from "../client";
import { taskRunsTable } from "../schema";

const createTaskRunRecord = makeTaskRun();

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

const toTaskRun = (row: typeof taskRunsTable.$inferSelect) => ({
  id: row.id,
  profileId: row.profileId,
  scheduleId: row.scheduleId,
  status: row.status as
    | "queued"
    | "claimed"
    | "running"
    | "succeeded"
    | "failed"
    | "retry_scheduled"
    | "cancelled",
  scheduledFor: row.scheduledFor,
  promptSnapshot: row.promptSnapshot,
  toolPolicySnapshot: parseJson(row.toolPolicySnapshotJson),
  inputSnapshot: parseJson(row.inputSnapshotJson),
  attempt: row.attempt,
  maxAttempts: row.maxAttempts,
  leaseOwner: row.leaseOwner,
  leaseExpiresAt: row.leaseExpiresAt,
  heartbeatAt: row.heartbeatAt,
  nextRetryAt: row.nextRetryAt,
  runtimeTurnId: row.runtimeTurnId,
  result: parseJson(row.resultJson),
  error: parseJson(row.errorJson),
  createdAt: row.createdAt,
  startedAt: row.startedAt,
  finishedAt: row.finishedAt,
  updatedAt: row.updatedAt,
});

const createTaskRun = Effect.fnUntraced(function* (input: {
  profileId: string;
  scheduleId: string;
  scheduledFor: string;
  promptSnapshot: string;
  toolPolicySnapshot?: Record<string, unknown> | null;
  inputSnapshot?: Record<string, unknown> | null;
  maxAttempts?: number;
}) {
  const record = createTaskRunRecord(input);
  yield* fromPromise("createTaskRun", () =>
    db.insert(taskRunsTable).values(record)
  );
  return toTaskRun(record);
});

const getTaskRun = Effect.fnUntraced(function* (taskRunId: string) {
  const row = yield* fromPromise("getTaskRun", () =>
    db.query.taskRunsTable.findFirst({
      where: { id: taskRunId },
    })
  );

  return row ? toTaskRun(row) : null;
});

const listTaskRunsBySchedule = Effect.fnUntraced(function* (
  scheduleId: string,
  input?: {
    limit?: number;
  }
) {
  const query = db
    .select()
    .from(taskRunsTable)
    .where(eq(taskRunsTable.scheduleId, scheduleId))
    .orderBy(desc(taskRunsTable.createdAt), desc(taskRunsTable.scheduledFor));

  const rows = yield* fromPromise("listTaskRunsBySchedule", () =>
    input?.limit === undefined ? query : query.limit(input.limit)
  );

  return rows.map(toTaskRun);
});

const getTaskRunByScheduleAndScheduledFor = Effect.fnUntraced(
  function* (input: { scheduleId: string; scheduledFor: string }) {
    const row = yield* fromPromise("getTaskRunByScheduleAndScheduledFor", () =>
      db.query.taskRunsTable.findFirst({
        where: {
          scheduleId: input.scheduleId,
          scheduledFor: input.scheduledFor,
        },
      })
    );

    return row ? toTaskRun(row) : null;
  }
);

const listClaimableTaskRuns = Effect.fnUntraced(function* (input: {
  nowIso: string;
  profileId?: string;
  limit: number;
}) {
  const filters = [
    ...(input.profileId ? [eq(taskRunsTable.profileId, input.profileId)] : []),
    or(
      and(
        inArray(taskRunsTable.status, ["queued", "retry_scheduled"]),
        or(
          isNull(taskRunsTable.nextRetryAt),
          lte(taskRunsTable.nextRetryAt, input.nowIso)
        ),
        or(
          isNull(taskRunsTable.leaseExpiresAt),
          lte(taskRunsTable.leaseExpiresAt, input.nowIso)
        )
      ),
      and(
        eq(taskRunsTable.status, "claimed"),
        lte(taskRunsTable.leaseExpiresAt, input.nowIso)
      )
    ),
  ];

  const rows = yield* fromPromise("listClaimableTaskRuns", () =>
    db
      .select()
      .from(taskRunsTable)
      .where(and(...filters))
      .orderBy(asc(taskRunsTable.scheduledFor), asc(taskRunsTable.createdAt))
      .limit(input.limit)
  );

  return rows.map(toTaskRun).filter((run) =>
    isClaimableDurableRun({
      status: run.status,
      leaseExpiresAt: run.leaseExpiresAt,
      nextRetryAt: run.nextRetryAt,
      nowIso: input.nowIso,
    })
  );
});

const updateTaskRun = Effect.fnUntraced(function* (
  taskRunId: string,
  patch: Partial<typeof taskRunsTable.$inferInsert>
) {
  yield* fromPromise("updateTaskRun", () =>
    db.update(taskRunsTable).set(patch).where(eq(taskRunsTable.id, taskRunId))
  );
  return yield* getTaskRun(taskRunId);
});

const claimTaskRun = Effect.fnUntraced(function* (input: {
  taskRunId: string;
  nowIso: string;
  leaseOwner: string;
  leaseExpiresAt: string;
}) {
  const claimed = yield* fromPromise("claimTaskRun", () =>
    db
      .update(taskRunsTable)
      .set({ ...makeClaimPatch(input), heartbeatAt: input.nowIso })
      .where(
        and(
          eq(taskRunsTable.id, input.taskRunId),
          or(
            and(
              inArray(taskRunsTable.status, ["queued", "retry_scheduled"]),
              or(
                isNull(taskRunsTable.nextRetryAt),
                lte(taskRunsTable.nextRetryAt, input.nowIso)
              ),
              or(
                isNull(taskRunsTable.leaseExpiresAt),
                lte(taskRunsTable.leaseExpiresAt, input.nowIso)
              )
            ),
            and(
              eq(taskRunsTable.status, "claimed"),
              lte(taskRunsTable.leaseExpiresAt, input.nowIso)
            )
          )
        )
      )
      .returning()
      .then((rows) => rows[0] ?? null)
  );
  return claimed ? toTaskRun(claimed) : null;
});

const startTaskRun = Effect.fnUntraced(function* (
  taskRunId: string,
  input?: {
    nowIso?: string;
    runtimeTurnId?: string | null;
  }
) {
  const current = yield* getTaskRun(taskRunId);
  if (!current) {
    return null;
  }

  if (!canStartDurableRun(current.status)) {
    return null;
  }

  const nowIso = input?.nowIso ?? new Date().toISOString();

  return yield* updateTaskRun(taskRunId, {
    ...makeStartPatch({ attempt: current.attempt, nowIso }),
    runtimeTurnId:
      input?.runtimeTurnId === undefined
        ? current.runtimeTurnId
        : input.runtimeTurnId,
    startedAt: current.startedAt ?? nowIso,
    heartbeatAt: nowIso,
  });
});

const heartbeatTaskRun = Effect.fnUntraced(function* (
  taskRunId: string,
  input: {
    nowIso: string;
    leaseExpiresAt: string;
  }
) {
  return yield* updateTaskRun(taskRunId, {
    heartbeatAt: input.nowIso,
    leaseExpiresAt: input.leaseExpiresAt,
    updatedAt: input.nowIso,
  });
});

const attachTaskRunRuntimeTurn = Effect.fnUntraced(function* (
  taskRunId: string,
  runtimeTurnId: string
) {
  return yield* updateTaskRun(taskRunId, {
    runtimeTurnId,
    updatedAt: new Date().toISOString(),
  });
});

const completeTaskRun = Effect.fnUntraced(function* (
  taskRunId: string,
  input?: {
    nowIso?: string;
    result?: Record<string, unknown> | null;
    runtimeTurnId?: string | null;
  }
) {
  const nowIso = input?.nowIso ?? new Date().toISOString();
  const current = yield* getTaskRun(taskRunId);
  if (!current) {
    return null;
  }

  return yield* updateTaskRun(taskRunId, {
    ...makeCompletionPatch(nowIso),
    runtimeTurnId:
      input?.runtimeTurnId === undefined
        ? current.runtimeTurnId
        : input.runtimeTurnId,
    resultJson: input?.result ? JSON.stringify(input.result) : null,
    heartbeatAt: nowIso,
  });
});

const failTaskRun = Effect.fnUntraced(function* (
  taskRunId: string,
  input: {
    nowIso?: string;
    error?: Record<string, unknown> | null;
    runtimeTurnId?: string | null;
    nextRetryAt?: string | null;
  }
) {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const current = yield* getTaskRun(taskRunId);
  if (!current) {
    return null;
  }

  const lifecycle = makeFailurePatch({
    attempt: current.attempt,
    maxAttempts: current.maxAttempts,
    nowIso,
    nextRetryAt: input.nextRetryAt ?? null,
  });

  return yield* updateTaskRun(taskRunId, {
    ...lifecycle,
    runtimeTurnId:
      input.runtimeTurnId === undefined
        ? current.runtimeTurnId
        : input.runtimeTurnId,
    errorJson: input.error ? JSON.stringify(input.error) : null,
    heartbeatAt: nowIso,
  });
});

const cancelTaskRun = Effect.fnUntraced(function* (
  taskRunId: string,
  nowIso = new Date().toISOString()
) {
  const current = yield* getTaskRun(taskRunId);
  if (!(current && isCancellableDurableRun(current.status))) {
    return null;
  }
  return yield* updateTaskRun(taskRunId, makeCancellationPatch(nowIso));
});

export {
  attachTaskRunRuntimeTurn,
  cancelTaskRun,
  claimTaskRun,
  completeTaskRun,
  createTaskRun,
  failTaskRun,
  getTaskRun,
  getTaskRunByScheduleAndScheduledFor,
  heartbeatTaskRun,
  listClaimableTaskRuns,
  listTaskRunsBySchedule,
  startTaskRun,
  updateTaskRun,
};
