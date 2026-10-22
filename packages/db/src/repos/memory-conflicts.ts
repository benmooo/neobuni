import { makeMemoryConflict } from "@neobuni/core";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Effect } from "effect";

import { db, fromPromise } from "../client";
import { memoryConflictsTable } from "../schema";

const createMemoryConflictRecord = makeMemoryConflict();

type MemoryConflictStatus = "open" | "resolved" | "cancelled";
type MemoryConflictOperation = "save" | "update";
type MemoryConflictKind = "semantic_overlap" | "task_overlap";

type ProposedMemory = {
  content: string;
  type: "event" | "thought" | "preference" | "fact" | "task";
  keywords: string[];
  importance: number;
  unresolved: boolean;
  status: "active" | "done" | "superseded" | "archived";
  memoryClass: "episodic" | "semantic" | "task";
};

const parseJson = <T>(value: string | null): T | null => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const toMemoryConflict = (row: typeof memoryConflictsTable.$inferSelect) => ({
  id: row.id,
  profileId: row.profileId,
  conversationId: row.conversationId,
  turnId: row.turnId,
  operation: row.operation as MemoryConflictOperation,
  kind: row.conflictKind as MemoryConflictKind,
  status: row.status as MemoryConflictStatus,
  reason: row.reason,
  existingMemoryId: row.existingMemoryId,
  subjectMemoryId: row.subjectMemoryId,
  proposedMemory: parseJson<ProposedMemory>(row.proposalJson),
  resolution: parseJson<Record<string, unknown>>(row.resolutionJson),
  resolvedAt: row.resolvedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const createMemoryConflict = Effect.fnUntraced(function* (input: {
  profileId: string;
  conversationId?: string | null;
  turnId?: string | null;
  operation: MemoryConflictOperation;
  kind: MemoryConflictKind;
  reason: string;
  existingMemoryId: string;
  subjectMemoryId?: string | null;
  proposedMemory: ProposedMemory;
}) {
  const record = createMemoryConflictRecord({
    profileId: input.profileId,
    conversationId: input.conversationId ?? null,
    turnId: input.turnId ?? null,
    operation: input.operation,
    conflictKind: input.kind,
    reason: input.reason,
    existingMemoryId: input.existingMemoryId,
    subjectMemoryId: input.subjectMemoryId ?? null,
    proposalJson: JSON.stringify(input.proposedMemory),
  });

  yield* fromPromise("createMemoryConflict", () =>
    db.insert(memoryConflictsTable).values(record),
  );

  return toMemoryConflict(record);
});

const findMatchingOpenMemoryConflict = Effect.fnUntraced(function* (input: {
  profileId: string;
  operation: MemoryConflictOperation;
  existingMemoryId: string;
  subjectMemoryId?: string | null;
  proposedMemory: ProposedMemory;
}) {
  const subjectMemoryFilter =
    input.subjectMemoryId === null || input.subjectMemoryId === undefined
      ? isNull(memoryConflictsTable.subjectMemoryId)
      : eq(memoryConflictsTable.subjectMemoryId, input.subjectMemoryId);
  const rows = yield* fromPromise("findMatchingOpenMemoryConflict", () =>
    db
      .select()
      .from(memoryConflictsTable)
      .where(and(
        eq(memoryConflictsTable.profileId, input.profileId),
        eq(memoryConflictsTable.status, "open"),
        eq(memoryConflictsTable.operation, input.operation),
        eq(memoryConflictsTable.existingMemoryId, input.existingMemoryId),
        subjectMemoryFilter,
      ))
      .orderBy(desc(memoryConflictsTable.createdAt)),
  );

  const proposalJson = JSON.stringify(input.proposedMemory);
  const match = rows.find((row) => row.proposalJson === proposalJson);

  return match ? toMemoryConflict(match) : null;
});

const getMemoryConflict = Effect.fnUntraced(function* (conflictId: string) {
  const row = yield* fromPromise("getMemoryConflict", () =>
    db
      .select()
      .from(memoryConflictsTable)
      .where(eq(memoryConflictsTable.id, conflictId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  );

  return row ? toMemoryConflict(row) : null;
});

const updateMemoryConflict = Effect.fnUntraced(function* (
  conflictId: string,
  patch: Partial<{
    status: MemoryConflictStatus;
    resolution: Record<string, unknown> | null;
    resolvedAt: string | null;
  }>,
) {
  const now = new Date().toISOString();

  yield* fromPromise("updateMemoryConflict", () =>
    db
      .update(memoryConflictsTable)
      .set({
        status: patch.status,
        resolutionJson:
          patch.resolution === undefined
            ? undefined
            : patch.resolution === null
              ? null
              : JSON.stringify(patch.resolution),
        resolvedAt: patch.resolvedAt,
        updatedAt: now,
      })
      .where(eq(memoryConflictsTable.id, conflictId)),
  );

  return yield* getMemoryConflict(conflictId);
});

export {
  createMemoryConflict,
  findMatchingOpenMemoryConflict,
  getMemoryConflict,
  updateMemoryConflict,
};
