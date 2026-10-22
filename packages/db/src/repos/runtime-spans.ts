import { makeRuntimeSpan } from "@neobuni/core";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";

import { db, fromPromise } from "../client";
import { runtimeSpansTable, runtimeTurnsTable } from "../schema";

const createRuntimeSpanRecord = makeRuntimeSpan();

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

const toRuntimeSpan = (row: typeof runtimeSpansTable.$inferSelect) => ({
	id: row.id,
	turnId: row.turnId,
	conversationId: row.conversationId,
	stage: row.stage,
	seq: row.seq,
	status: row.status as "running" | "completed" | "failed" | "skipped",
	startedAt: row.startedAt,
	endedAt: row.endedAt,
	durationMs: row.durationMs,
	input: parseJson(row.inputJson),
	output: parseJson(row.outputJson),
	error: parseJson(row.errorJson),
});

export const createRuntimeSpan = Effect.fnUntraced(function* (input: {
	turnId: string;
	conversationId?: string | null;
	stage: string;
	seq: number;
	payload?: Record<string, unknown> | null;
}) {
	const record = createRuntimeSpanRecord({
		turnId: input.turnId,
		conversationId: input.conversationId,
		stage: input.stage,
		seq: input.seq,
		input: input.payload ?? null,
	});
	yield* fromPromise("createRuntimeSpan", () =>
		db.insert(runtimeSpansTable).values(record)
	);
	return toRuntimeSpan(record);
});

export const completeRuntimeSpan = Effect.fnUntraced(function* (
	spanId: string,
	output?: Record<string, unknown> | null
) {
	const row = yield* fromPromise("completeRuntimeSpan", () =>
		db.query.runtimeSpansTable.findFirst({
			where: { id: spanId },
		})
	);

	if (!row) {
		return null;
	}

	const endedAt = new Date().toISOString();
	const durationMs = Math.max(
		0,
		new Date(endedAt).getTime() - new Date(row.startedAt).getTime()
	);

	yield* fromPromise("completeRuntimeSpan", () =>
		db
			.update(runtimeSpansTable)
			.set({
				status: "completed",
				endedAt,
				durationMs,
				outputJson: output ? JSON.stringify(output) : null,
			})
			.where(eq(runtimeSpansTable.id, spanId))
	);

	const updated = yield* fromPromise("completeRuntimeSpan", () =>
		db.query.runtimeSpansTable.findFirst({
			where: { id: spanId },
		})
	);

	return updated ? toRuntimeSpan(updated) : null;
});

export const failRuntimeSpan = Effect.fnUntraced(function* (
	spanId: string,
	error?: Record<string, unknown> | null,
	output?: Record<string, unknown> | null
) {
	const row = yield* fromPromise("failRuntimeSpan", () =>
		db.query.runtimeSpansTable.findFirst({
			where: { id: spanId },
		})
	);

	if (!row) {
		return null;
	}

	const endedAt = new Date().toISOString();
	const durationMs = Math.max(
		0,
		new Date(endedAt).getTime() - new Date(row.startedAt).getTime()
	);

	yield* fromPromise("failRuntimeSpan", () =>
		db
			.update(runtimeSpansTable)
			.set({
				status: "failed",
				endedAt,
				durationMs,
				outputJson: output ? JSON.stringify(output) : null,
				errorJson: error ? JSON.stringify(error) : null,
			})
			.where(eq(runtimeSpansTable.id, spanId))
	);

	const updated = yield* fromPromise("failRuntimeSpan", () =>
		db.query.runtimeSpansTable.findFirst({
			where: { id: spanId },
		})
	);

	return updated ? toRuntimeSpan(updated) : null;
});

export const skipRuntimeSpan = Effect.fnUntraced(function* (
	spanId: string,
	output?: Record<string, unknown> | null
) {
	const row = yield* fromPromise("skipRuntimeSpan", () =>
		db.query.runtimeSpansTable.findFirst({
			where: { id: spanId },
		})
	);

	if (!row) {
		return null;
	}

	const endedAt = new Date().toISOString();
	const durationMs = Math.max(
		0,
		new Date(endedAt).getTime() - new Date(row.startedAt).getTime()
	);

	yield* fromPromise("skipRuntimeSpan", () =>
		db
			.update(runtimeSpansTable)
			.set({
				status: "skipped",
				endedAt,
				durationMs,
				outputJson: output ? JSON.stringify(output) : null,
			})
			.where(eq(runtimeSpansTable.id, spanId))
	);

	const updated = yield* fromPromise("skipRuntimeSpan", () =>
		db.query.runtimeSpansTable.findFirst({
			where: { id: spanId },
		})
	);

	return updated ? toRuntimeSpan(updated) : null;
});

export const listRuntimeSpansByTurn = Effect.fnUntraced(function* (
	turnId: string
) {
	const rows = yield* fromPromise("listRuntimeSpansByTurn", () =>
		db
			.select()
			.from(runtimeSpansTable)
			.where(eq(runtimeSpansTable.turnId, turnId))
			.orderBy(asc(runtimeSpansTable.seq), asc(runtimeSpansTable.startedAt))
	);

	return rows.map(toRuntimeSpan);
});

export const listRecentRuntimeSpans = Effect.fnUntraced(function* (input: {
	profileId: string;
	statuses?: Array<"running" | "completed" | "failed" | "skipped">;
	limit?: number;
}) {
	const filters = [
		eq(runtimeTurnsTable.profileId, input.profileId),
		...(input.statuses && input.statuses.length > 0
			? [inArray(runtimeSpansTable.status, input.statuses)]
			: []),
	];

	const query = db
		.select({
			span: runtimeSpansTable,
		})
		.from(runtimeSpansTable)
		.innerJoin(
			runtimeTurnsTable,
			eq(runtimeSpansTable.turnId, runtimeTurnsTable.id)
		)
		.where(and(...filters))
		.orderBy(desc(runtimeSpansTable.startedAt), desc(runtimeSpansTable.seq));

	const rows = yield* fromPromise("listRecentRuntimeSpans", async () =>
		input.limit === undefined ? await query : await query.limit(input.limit)
	);

	return rows.map((row) => toRuntimeSpan(row.span));
});
