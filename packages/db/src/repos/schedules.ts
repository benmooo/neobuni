import { makeSchedule } from "@neobuni/core";
import { and, asc, eq, lte } from "drizzle-orm";
import { Effect } from "effect";

import { db, fromPromise } from "../client";
import { schedulesTable } from "../schema";

const createScheduleRecord = makeSchedule();

const parseMetadata = (value: string) => {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const parseOptionalJson = (value: string | null) => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const toSchedule = (row: typeof schedulesTable.$inferSelect) => ({
  id: row.id,
  profileId: row.profileId,
  type: row.type as "reminder" | "alarm" | "monitor",
  title: row.title,
  content: row.content,
  triggerAt: row.triggerAt,
  cronExpr: row.cronExpr,
  timezone: row.timezone,
  status: row.status as "active" | "paused" | "completed" | "cancelled",
  lastTriggeredAt: row.lastTriggeredAt,
  deliveredAt: row.deliveredAt,
  lastMaterializedAt: row.lastMaterializedAt,
  metadata: parseMetadata(row.metadataJson),
  blueprint: parseOptionalJson(row.blueprintJson),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const listSchedules = Effect.fnUntraced(function* (profileId: string) {
  const rows = yield* fromPromise("listSchedules", () =>
    db.query.schedulesTable.findMany({
      where: { profileId },
      orderBy: { updatedAt: "desc" },
    })
  );

  return rows.map(toSchedule);
});

const listDueSchedules = Effect.fnUntraced(function* (
  profileId: string,
  input: {
    nowIso: string;
    limit: number;
  }
) {
  const rows = yield* fromPromise("listDueSchedules", () =>
    db
      .select()
      .from(schedulesTable)
      .where(
        and(
          eq(schedulesTable.profileId, profileId),
          eq(schedulesTable.status, "active"),
          lte(schedulesTable.triggerAt, input.nowIso)
        )
      )
      .orderBy(asc(schedulesTable.triggerAt), asc(schedulesTable.createdAt))
      .limit(input.limit)
  );

  return rows.map(toSchedule);
});

const getSchedule = Effect.fnUntraced(function* (scheduleId: string) {
  const row = yield* fromPromise("getSchedule", () =>
    db.query.schedulesTable.findFirst({
      where: { id: scheduleId },
    })
  );

  if (!row) {
    return null;
  }

  return toSchedule(row);
});

const createSchedule = Effect.fnUntraced(function* (
  profileId: string,
  input: {
    type: "reminder" | "alarm" | "monitor";
    title: string;
    content: string;
    triggerAt: string | null;
    cronExpr: string | null;
    timezone: string;
    metadata: Record<string, unknown>;
    blueprint?: Record<string, unknown> | null;
  }
) {
  const record = createScheduleRecord({
    profileId,
    type: input.type,
    title: input.title,
    content: input.content,
    triggerAt: input.triggerAt,
    cronExpr: input.cronExpr,
    timezone: input.timezone,
    metadata: input.metadata,
    blueprint: input.blueprint ?? null,
  });

  yield* fromPromise("createSchedule", () =>
    db.insert(schedulesTable).values(record)
  );

  return {
    id: record.id,
    profileId: record.profileId,
    type: record.type,
    title: record.title,
    content: record.content,
    triggerAt: record.triggerAt,
    cronExpr: record.cronExpr,
    timezone: record.timezone,
    status: record.status,
    lastTriggeredAt: record.lastTriggeredAt,
    deliveredAt: record.deliveredAt,
    lastMaterializedAt: record.lastMaterializedAt,
    metadata: input.metadata,
    blueprint: input.blueprint ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
});

const updateSchedule = Effect.fnUntraced(function* (
  scheduleId: string,
  input: Partial<{
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
  }>
) {
  const current = yield* fromPromise("updateSchedule", () =>
    db.query.schedulesTable.findFirst({
      where: { id: scheduleId },
    })
  );
  if (!current) {
    return null;
  }

  const next = {
    type: input.type ?? current.type,
    title: input.title ?? current.title,
    content: input.content ?? current.content,
    triggerAt:
      input.triggerAt === undefined ? current.triggerAt : input.triggerAt,
    cronExpr: input.cronExpr === undefined ? current.cronExpr : input.cronExpr,
    timezone: input.timezone ?? current.timezone,
    status: input.status ?? current.status,
    lastTriggeredAt:
      input.lastTriggeredAt === undefined
        ? current.lastTriggeredAt
        : input.lastTriggeredAt,
    deliveredAt:
      input.deliveredAt === undefined ? current.deliveredAt : input.deliveredAt,
    lastMaterializedAt:
      input.lastMaterializedAt === undefined
        ? current.lastMaterializedAt
        : input.lastMaterializedAt,
    metadataJson:
      input.metadata === undefined
        ? current.metadataJson
        : JSON.stringify(input.metadata),
    blueprintJson:
      input.blueprint === undefined
        ? current.blueprintJson
        : JSON.stringify(input.blueprint),
    updatedAt: new Date().toISOString(),
  };

  yield* fromPromise("updateSchedule", () =>
    db.update(schedulesTable).set(next).where(eq(schedulesTable.id, scheduleId))
  );

  return {
    id: current.id,
    profileId: current.profileId,
    type: next.type as "reminder" | "alarm" | "monitor",
    title: next.title,
    content: next.content,
    triggerAt: next.triggerAt,
    cronExpr: next.cronExpr,
    timezone: next.timezone,
    status: next.status as "active" | "paused" | "completed" | "cancelled",
    lastTriggeredAt: next.lastTriggeredAt,
    deliveredAt: next.deliveredAt,
    lastMaterializedAt: next.lastMaterializedAt,
    metadata: parseMetadata(next.metadataJson),
    blueprint: parseOptionalJson(next.blueprintJson),
    createdAt: current.createdAt,
    updatedAt: next.updatedAt,
  };
});

const deleteSchedule = Effect.fnUntraced(function* (scheduleId: string) {
  yield* fromPromise("deleteSchedule", () =>
    db.delete(schedulesTable).where(eq(schedulesTable.id, scheduleId))
  );
  return { deleted: true };
});

export {
  createSchedule,
  deleteSchedule,
  getSchedule,
  listDueSchedules,
  listSchedules,
  updateSchedule,
};
