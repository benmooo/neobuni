import type { ActionAuthorization, ActionProposal } from "@neobuni/contracts"
import { and, asc, desc, eq } from "drizzle-orm"
import { Effect } from "effect"
import { db, fromPromise } from "../client"
import { actionAuthorizationsTable, actionProposalsTable } from "../schema"

const parseJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

const toProposal = (
  row: typeof actionProposalsTable.$inferSelect,
): ActionProposal => ({
  id: row.id,
  profileId: row.profileId,
  goalId: row.goalId,
  decisionId: row.decisionId,
  candidateId: row.candidateId,
  kind: row.kind,
  title: row.title,
  expectedOutcome: row.expectedOutcome,
  reversibility: row.reversibility as ActionProposal["reversibility"],
  requiredAuthority:
    row.requiredAuthority as ActionProposal["requiredAuthority"],
  input: parseJson(row.inputJson, {}),
  status: row.status as ActionProposal["status"],
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

const toAuthorization = (
  row: typeof actionAuthorizationsTable.$inferSelect,
): ActionAuthorization => ({
  id: row.id,
  proposalId: row.proposalId,
  profileId: row.profileId,
  mode: row.mode as ActionAuthorization["mode"],
  grantedBy: row.grantedBy as ActionAuthorization["grantedBy"],
  constraints: parseJson(row.constraintsJson, {}),
  expiresAt: row.expiresAt,
  revokedAt: row.revokedAt,
  createdAt: row.createdAt,
})

const createActionProposal = Effect.fnUntraced(function* (
  input: Omit<ActionProposal, "id" | "createdAt" | "updatedAt"> & {
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
    decisionId: input.decisionId,
    candidateId: input.candidateId,
    kind: input.kind,
    title: input.title,
    expectedOutcome: input.expectedOutcome,
    reversibility: input.reversibility,
    requiredAuthority: input.requiredAuthority,
    inputJson: JSON.stringify(input.input),
    status: input.status,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  }
  yield* fromPromise("createActionProposal", () =>
    db.insert(actionProposalsTable).values(record),
  )
  return toProposal(record)
})

const getActionProposal = Effect.fnUntraced(function* (proposalId: string) {
  const row = yield* fromPromise("getActionProposal", () =>
    db
      .select()
      .from(actionProposalsTable)
      .where(eq(actionProposalsTable.id, proposalId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  )
  return row ? toProposal(row) : null
})

const updateActionProposalStatus = Effect.fnUntraced(function* (
  proposalId: string,
  status: ActionProposal["status"],
  updatedAt = new Date().toISOString(),
) {
  yield* fromPromise("updateActionProposalStatus", () =>
    db
      .update(actionProposalsTable)
      .set({ status, updatedAt })
      .where(eq(actionProposalsTable.id, proposalId)),
  )
  return yield* getActionProposal(proposalId)
})

const listActionProposalsByDecision = Effect.fnUntraced(function* (
  profileId: string,
  decisionId: string,
) {
  const rows = yield* fromPromise("listActionProposalsByDecision", () =>
    db
      .select()
      .from(actionProposalsTable)
      .where(
        and(
          eq(actionProposalsTable.profileId, profileId),
          eq(actionProposalsTable.decisionId, decisionId),
        ),
      )
      .orderBy(desc(actionProposalsTable.createdAt)),
  )
  return rows.map(toProposal)
})

const createActionAuthorization = Effect.fnUntraced(function* (
  input: Omit<ActionAuthorization, "id" | "createdAt" | "revokedAt"> & {
    id?: string
    createdAt?: string
  },
) {
  const record = {
    id: input.id ?? crypto.randomUUID(),
    proposalId: input.proposalId,
    profileId: input.profileId,
    mode: input.mode,
    grantedBy: input.grantedBy,
    constraintsJson: JSON.stringify(input.constraints),
    expiresAt: input.expiresAt,
    revokedAt: null,
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
  yield* fromPromise("createActionAuthorization", () =>
    db.insert(actionAuthorizationsTable).values(record),
  )
  return toAuthorization(record)
})

const listActionAuthorizationsByProposal = Effect.fnUntraced(function* (
  profileId: string,
  proposalId: string,
) {
  const rows = yield* fromPromise("listActionAuthorizationsByProposal", () =>
    db
      .select()
      .from(actionAuthorizationsTable)
      .where(
        and(
          eq(actionAuthorizationsTable.profileId, profileId),
          eq(actionAuthorizationsTable.proposalId, proposalId),
        ),
      )
      .orderBy(asc(actionAuthorizationsTable.createdAt)),
  )
  return rows.map(toAuthorization)
})

const getActionAuthorization = Effect.fnUntraced(function* (
  authorizationId: string,
) {
  const row = yield* fromPromise("getActionAuthorization", () =>
    db
      .select()
      .from(actionAuthorizationsTable)
      .where(eq(actionAuthorizationsTable.id, authorizationId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  )
  return row ? toAuthorization(row) : null
})

const revokeActionAuthorization = Effect.fnUntraced(function* (
  profileId: string,
  authorizationId: string,
  revokedAt = new Date().toISOString(),
) {
  yield* fromPromise("revokeActionAuthorization", () =>
    db
      .update(actionAuthorizationsTable)
      .set({ revokedAt })
      .where(
        and(
          eq(actionAuthorizationsTable.id, authorizationId),
          eq(actionAuthorizationsTable.profileId, profileId),
        ),
      ),
  )
  const row = yield* fromPromise("revokeActionAuthorization", () =>
    db
      .select()
      .from(actionAuthorizationsTable)
      .where(eq(actionAuthorizationsTable.id, authorizationId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  )
  return row?.profileId === profileId ? toAuthorization(row) : null
})

export {
  createActionAuthorization,
  createActionProposal,
  getActionAuthorization,
  getActionProposal,
  listActionAuthorizationsByProposal,
  listActionProposalsByDecision,
  revokeActionAuthorization,
  updateActionProposalStatus,
}
