import type {
  ActionReceipt,
  ActionRun,
  ActionRunCheckpoint,
  ActionRunInput,
} from "@neobuni/contracts"
import {
  isClaimableDurableRun,
  makeCancellationPatch,
  makeClaimPatch,
  makeCompletionPatch,
  makeFailurePatch,
  makeStartPatch,
} from "@neobuni/core"
import { and, asc, eq, inArray, lte, or } from "drizzle-orm"
import { Effect } from "effect"
import { db, fromPromise } from "../client"
import { actionRunsTable } from "../schema"

const parseJson = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
const withoutRetryAt = <T extends { nextRetryAt: unknown }>(patch: T) => {
  const actionRunPatch = { ...patch }
  delete actionRunPatch.nextRetryAt
  return actionRunPatch
}

const toActionRun = (row: typeof actionRunsTable.$inferSelect): ActionRun => ({
  id: row.id,
  profileId: row.profileId,
  proposalId: row.proposalId,
  authorizationId: row.authorizationId,
  idempotencyKey: row.idempotencyKey,
  status: row.status as ActionRun["status"],
  input: parseJson<ActionRunInput>(row.inputJson, {
    operation: "commitment_status_update",
    commitmentId: "invalid",
    expectedStatus: "open",
    nextStatus: "open",
  }),
  attempt: row.attempt,
  maxAttempts: row.maxAttempts,
  leaseOwner: row.leaseOwner,
  leaseExpiresAt: row.leaseExpiresAt,
  checkpoint: parseJson<ActionRunCheckpoint | null>(row.checkpointJson, null),
  receipt: parseJson<ActionReceipt | null>(row.receiptJson, null),
  result: parseJson(row.resultJson, null),
  error: parseJson(row.errorJson, null),
  createdAt: row.createdAt,
  startedAt: row.startedAt,
  finishedAt: row.finishedAt,
  updatedAt: row.updatedAt,
})

const createActionRun = Effect.fnUntraced(function* (input: {
  profileId: string
  proposalId: string
  authorizationId: string
  input: ActionRunInput
  maxAttempts?: number
  idempotencyKey?: string
  id?: string
  createdAt?: string
}) {
  const now = input.createdAt ?? new Date().toISOString()
  const id = input.id ?? crypto.randomUUID()
  const record = {
    id,
    profileId: input.profileId,
    proposalId: input.proposalId,
    authorizationId: input.authorizationId,
    idempotencyKey: input.idempotencyKey ?? `action-run:${id}`,
    status: "queued" as const,
    inputJson: JSON.stringify(input.input),
    attempt: 0,
    maxAttempts: input.maxAttempts ?? 1,
    leaseOwner: null,
    leaseExpiresAt: null,
    checkpointJson: JSON.stringify({
      phase: "queued",
      recordedAt: now,
      data: {},
    }),
    receiptJson: null,
    resultJson: null,
    errorJson: null,
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    updatedAt: now,
  }
  yield* fromPromise("createActionRun", () =>
    db.insert(actionRunsTable).values(record),
  )
  return toActionRun(record)
})
const getActionRun = Effect.fnUntraced(function* (actionRunId: string) {
  const row = yield* fromPromise("getActionRun", () =>
    db
      .select()
      .from(actionRunsTable)
      .where(eq(actionRunsTable.id, actionRunId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  )
  return row ? toActionRun(row) : null
})
const getActionRunByProposal = Effect.fnUntraced(function* (proposalId: string) {
  const row = yield* fromPromise("getActionRunByProposal", () =>
    db
      .select()
      .from(actionRunsTable)
      .where(eq(actionRunsTable.proposalId, proposalId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  )
  return row ? toActionRun(row) : null
})
const listClaimableActionRuns = Effect.fnUntraced(function* (input: {
  nowIso: string
  profileId?: string
  limit: number
}) {
  const rows = yield* fromPromise("listClaimableActionRuns", () =>
    db
      .select()
      .from(actionRunsTable)
      .where(
        and(
          ...(input.profileId
            ? [eq(actionRunsTable.profileId, input.profileId)]
            : []),
          or(
            eq(actionRunsTable.status, "queued"),
            and(
              eq(actionRunsTable.status, "claimed"),
              lte(actionRunsTable.leaseExpiresAt, input.nowIso),
            ),
          ),
        ),
      )
      .orderBy(asc(actionRunsTable.createdAt))
      .limit(input.limit),
  )

  return rows
    .map(toActionRun)
    .filter((run) =>
      isClaimableDurableRun({
        status: run.status,
        leaseExpiresAt: run.leaseExpiresAt,
        nextRetryAt: null,
        nowIso: input.nowIso,
      }),
    )
})
const claimActionRun = Effect.fnUntraced(function* (input: {
  actionRunId: string
  nowIso: string
  leaseOwner: string
  leaseExpiresAt: string
}) {
  const claimed = yield* fromPromise("claimActionRun", () =>
    db
      .update(actionRunsTable)
      .set({
        ...makeClaimPatch(input),
        checkpointJson: JSON.stringify({
          phase: "claimed",
          recordedAt: input.nowIso,
          data: { leaseOwner: input.leaseOwner },
        }),
      })
      .where(
        and(
          eq(actionRunsTable.id, input.actionRunId),
          or(
            eq(actionRunsTable.status, "queued"),
            and(
              eq(actionRunsTable.status, "claimed"),
              lte(actionRunsTable.leaseExpiresAt, input.nowIso),
            ),
          ),
        ),
      )
      .returning()
      .then((rows) => rows[0] ?? null),
  )
  return claimed ? toActionRun(claimed) : null
})
const startActionRun = Effect.fnUntraced(function* (
  actionRunId: string,
  nowIso = new Date().toISOString(),
) {
  const current = yield* getActionRun(actionRunId)
  if (!current || current.status !== "claimed") return null
  const started = yield* fromPromise("startActionRun", () =>
    db
      .update(actionRunsTable)
      .set({
        ...makeStartPatch({ attempt: current.attempt, nowIso }),
        startedAt: current.startedAt ?? nowIso,
        checkpointJson: JSON.stringify({
          phase: "running",
          recordedAt: nowIso,
          data: { attempt: current.attempt + 1 },
        }),
      })
      .where(
        and(
          eq(actionRunsTable.id, actionRunId),
          eq(actionRunsTable.status, "claimed"),
        ),
      )
      .returning()
      .then((rows) => rows[0] ?? null),
  )
  return started ? toActionRun(started) : null
})
const completeActionRun = Effect.fnUntraced(function* (
  actionRunId: string,
  result: Record<string, unknown>,
  receipt: ActionReceipt,
  nowIso = new Date().toISOString(),
) {
  const completed = yield* fromPromise("completeActionRun", () =>
    db
      .update(actionRunsTable)
      .set({
        ...withoutRetryAt(makeCompletionPatch(nowIso)),
        resultJson: JSON.stringify(result),
        receiptJson: JSON.stringify(receipt),
        checkpointJson: JSON.stringify({
          phase: "completed",
          recordedAt: nowIso,
          data: { receiptStatus: receipt.status },
        }),
      })
      .where(
        and(
          eq(actionRunsTable.id, actionRunId),
          eq(actionRunsTable.status, "running"),
        ),
      )
      .returning()
      .then((rows) => rows[0] ?? null),
  )
  return completed ? toActionRun(completed) : null
})
const failActionRun = Effect.fnUntraced(function* (
  actionRunId: string,
  error: Record<string, unknown>,
  nowIso = new Date().toISOString(),
) {
  const current = yield* getActionRun(actionRunId)
  if (!current) return null
  const failed = yield* fromPromise("failActionRun", () =>
    db
      .update(actionRunsTable)
      .set({
        ...withoutRetryAt(
          makeFailurePatch({
            attempt: current.attempt,
            maxAttempts: current.maxAttempts,
            nowIso,
            nextRetryAt: null,
          }),
        ),
        errorJson: JSON.stringify(error),
        checkpointJson: JSON.stringify({
          phase: "failed",
          recordedAt: nowIso,
          data: {
            message: typeof error.message === "string" ? error.message : null,
          },
        }),
      })
      .where(
        and(
          eq(actionRunsTable.id, actionRunId),
          inArray(actionRunsTable.status, ["claimed", "running"]),
        ),
      )
      .returning()
      .then((rows) => rows[0] ?? null),
  )
  return failed ? toActionRun(failed) : null
})
const cancelActionRun = Effect.fnUntraced(function* (
  actionRunId: string,
  nowIso = new Date().toISOString(),
) {
  const current = yield* getActionRun(actionRunId)
  if (!current || !["queued", "claimed"].includes(current.status)) return null
  const cancelled = yield* fromPromise("cancelActionRun", () =>
    db
      .update(actionRunsTable)
      .set({
        ...makeCancellationPatch(nowIso),
        checkpointJson: JSON.stringify({
          phase: "cancelled",
          recordedAt: nowIso,
          data: {},
        }),
      })
      .where(
        and(
          eq(actionRunsTable.id, actionRunId),
          inArray(actionRunsTable.status, ["queued", "claimed"]),
        ),
      )
      .returning()
      .then((rows) => rows[0] ?? null),
  )
  return cancelled ? toActionRun(cancelled) : null
})
const confirmActionRunReceipt = Effect.fnUntraced(function* (
  actionRunId: string,
  nowIso = new Date().toISOString(),
) {
  const current = yield* getActionRun(actionRunId)
  if (
    !current ||
    current.status !== "succeeded" ||
    current.receipt?.status !== "external_unconfirmed"
  )
    return null
  const { receipt } = current
  const confirmed = yield* fromPromise("confirmActionRunReceipt", () =>
    db
      .update(actionRunsTable)
      .set({
        receiptJson: JSON.stringify({
          ...receipt,
          status: "external_confirmed",
          confirmedAt: nowIso,
        }),
        checkpointJson: JSON.stringify({
          phase: "externally_confirmed",
          recordedAt: nowIso,
          data: { receiptKind: receipt.kind },
        }),
        updatedAt: nowIso,
      })
      .where(
        and(
          eq(actionRunsTable.id, actionRunId),
          eq(actionRunsTable.status, "succeeded"),
          eq(actionRunsTable.receiptJson, JSON.stringify(receipt)),
        ),
      )
      .returning()
      .then((rows) => rows[0] ?? null),
  )
  return confirmed ? toActionRun(confirmed) : null
})
export {
  cancelActionRun,
  claimActionRun,
  confirmActionRunReceipt,
  completeActionRun,
  createActionRun,
  failActionRun,
  getActionRun,
  getActionRunByProposal,
  listClaimableActionRuns,
  startActionRun,
}
