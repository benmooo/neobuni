import { and, desc, eq } from "drizzle-orm"
import { Effect } from "effect"
import type {
  Commitment,
  CommitmentUpdate,
  Goal,
  GoalUpdate,
} from "@neobuni/contracts"
import { db, fromPromise } from "../client"
import { commitmentsTable, goalsTable } from "../schema"

const parseJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
const toGoal = (row: typeof goalsTable.$inferSelect): Goal => ({
  ...row,
  status: row.status as Goal["status"],
  horizon: row.horizon as Goal["horizon"],
  successCriteria: parseJson(row.successCriteriaJson, []),
  constraints: parseJson(row.constraintsJson, []),
  autonomyMode: row.autonomyMode as Goal["autonomyMode"],
})
const toCommitment = (
  row: typeof commitmentsTable.$inferSelect,
): Commitment => ({
  ...row,
  goalId: row.goalId,
  dueAt: row.dueAt,
  kind: row.kind as Commitment["kind"],
  status: row.status as Commitment["status"],
  owner: row.owner as Commitment["owner"],
  evidenceIds: parseJson(row.evidenceIdsJson, []),
})

const createGoal = Effect.fnUntraced(function* (
  input: Omit<Goal, "id" | "createdAt" | "updatedAt"> & {
    id?: string
    createdAt?: string
    updatedAt?: string
  },
) {
  const now = new Date().toISOString()
  const record = {
    id: input.id ?? crypto.randomUUID(),
    profileId: input.profileId,
    title: input.title,
    desiredOutcome: input.desiredOutcome,
    status: input.status,
    horizon: input.horizon,
    successCriteriaJson: JSON.stringify(input.successCriteria),
    constraintsJson: JSON.stringify(input.constraints),
    autonomyMode: input.autonomyMode,
    planVersion: input.planVersion,
    nextReviewAt: input.nextReviewAt,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  }
  yield* fromPromise("createGoal", () => db.insert(goalsTable).values(record))
  return toGoal(record)
})
const listGoals = Effect.fnUntraced(function* (
  profileId: string,
  status?: Goal["status"],
) {
  const rows = yield* fromPromise("listGoals", () =>
    db
      .select()
      .from(goalsTable)
      .where(
        and(
          eq(goalsTable.profileId, profileId),
          ...(status ? [eq(goalsTable.status, status)] : []),
        ),
      )
      .orderBy(desc(goalsTable.updatedAt)),
  )
  return rows.map(toGoal)
})
const getGoal = Effect.fnUntraced(function* (goalId: string) {
  const row = yield* fromPromise("getGoal", () =>
    db
      .select()
      .from(goalsTable)
      .where(eq(goalsTable.id, goalId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  )
  return row ? toGoal(row) : null
})
const updateGoal = Effect.fnUntraced(function* (input: {
  profileId: string
  goalId: string
  patch: GoalUpdate
  updatedAt?: string
}) {
  const updatedAt = input.updatedAt ?? new Date().toISOString()
  const values = {
    ...(input.patch.title === undefined ? {} : { title: input.patch.title }),
    ...(input.patch.desiredOutcome === undefined
      ? {}
      : { desiredOutcome: input.patch.desiredOutcome }),
    ...(input.patch.status === undefined ? {} : { status: input.patch.status }),
    ...(input.patch.horizon === undefined
      ? {}
      : { horizon: input.patch.horizon }),
    ...(input.patch.successCriteria === undefined
      ? {}
      : { successCriteriaJson: JSON.stringify(input.patch.successCriteria) }),
    ...(input.patch.constraints === undefined
      ? {}
      : { constraintsJson: JSON.stringify(input.patch.constraints) }),
    ...(input.patch.autonomyMode === undefined
      ? {}
      : { autonomyMode: input.patch.autonomyMode }),
    ...(input.patch.planVersion === undefined
      ? {}
      : { planVersion: input.patch.planVersion }),
    ...(input.patch.nextReviewAt === undefined
      ? {}
      : { nextReviewAt: input.patch.nextReviewAt }),
    updatedAt,
  }
  yield* fromPromise("updateGoal", () =>
    db
      .update(goalsTable)
      .set(values)
      .where(
        and(
          eq(goalsTable.id, input.goalId),
          eq(goalsTable.profileId, input.profileId),
        ),
      ),
  )
  const row = yield* fromPromise("updateGoal", () =>
    db
      .select()
      .from(goalsTable)
      .where(
        and(
          eq(goalsTable.id, input.goalId),
          eq(goalsTable.profileId, input.profileId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
  )
  return row ? toGoal(row) : null
})
const createCommitment = Effect.fnUntraced(function* (
  input: Omit<Commitment, "id" | "createdAt" | "updatedAt"> & {
    id?: string
    createdAt?: string
    updatedAt?: string
  },
) {
  const now = new Date().toISOString()
  const record = {
    id: input.id ?? crypto.randomUUID(),
    profileId: input.profileId,
    goalId: input.goalId,
    kind: input.kind,
    status: input.status,
    owner: input.owner,
    title: input.title,
    dueAt: input.dueAt,
    evidenceIdsJson: JSON.stringify(input.evidenceIds),
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  }
  yield* fromPromise("createCommitment", () =>
    db.insert(commitmentsTable).values(record),
  )
  return toCommitment(record)
})
const listCommitments = Effect.fnUntraced(function* (
  profileId: string,
  goalId?: string,
) {
  const rows = yield* fromPromise("listCommitments", () =>
    db
      .select()
      .from(commitmentsTable)
      .where(
        and(
          eq(commitmentsTable.profileId, profileId),
          ...(goalId ? [eq(commitmentsTable.goalId, goalId)] : []),
        ),
      )
      .orderBy(desc(commitmentsTable.updatedAt)),
  )
  return rows.map(toCommitment)
})
const updateCommitmentStatus = Effect.fnUntraced(function* (input: {
  profileId: string
  commitmentId: string
  expectedStatus: Commitment["status"]
  nextStatus: Commitment["status"]
  updatedAt?: string
}) {
  const updatedAt = input.updatedAt ?? new Date().toISOString()
  yield* fromPromise("updateCommitmentStatus", () =>
    db
      .update(commitmentsTable)
      .set({ status: input.nextStatus, updatedAt })
      .where(
        and(
          eq(commitmentsTable.id, input.commitmentId),
          eq(commitmentsTable.profileId, input.profileId),
          eq(commitmentsTable.status, input.expectedStatus),
        ),
      ),
  )
  const row = yield* fromPromise("updateCommitmentStatus", () =>
    db
      .select()
      .from(commitmentsTable)
      .where(eq(commitmentsTable.id, input.commitmentId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  )
  return row?.profileId === input.profileId && row.status === input.nextStatus
    ? toCommitment(row)
    : null
})
const updateCommitment = Effect.fnUntraced(function* (input: {
  profileId: string
  goalId: string
  commitmentId: string
  patch: CommitmentUpdate
  updatedAt?: string
}) {
  const updatedAt = input.updatedAt ?? new Date().toISOString()
  const values = {
    ...(input.patch.status === undefined ? {} : { status: input.patch.status }),
    ...(input.patch.title === undefined ? {} : { title: input.patch.title }),
    ...(input.patch.dueAt === undefined ? {} : { dueAt: input.patch.dueAt }),
    ...(input.patch.evidenceIds === undefined
      ? {}
      : { evidenceIdsJson: JSON.stringify(input.patch.evidenceIds) }),
    updatedAt,
  }
  yield* fromPromise("updateCommitment", () =>
    db
      .update(commitmentsTable)
      .set(values)
      .where(
        and(
          eq(commitmentsTable.id, input.commitmentId),
          eq(commitmentsTable.profileId, input.profileId),
          eq(commitmentsTable.goalId, input.goalId),
        ),
      ),
  )
  const row = yield* fromPromise("updateCommitment", () =>
    db
      .select()
      .from(commitmentsTable)
      .where(
        and(
          eq(commitmentsTable.id, input.commitmentId),
          eq(commitmentsTable.profileId, input.profileId),
          eq(commitmentsTable.goalId, input.goalId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
  )
  return row ? toCommitment(row) : null
})

export {
  createCommitment,
  createGoal,
  getGoal,
  listCommitments,
  listGoals,
  updateCommitment,
  updateCommitmentStatus,
  updateGoal,
}
