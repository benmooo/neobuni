import type {
	MemoryClass,
	MemorySourceKind,
	MemoryStatus,
	MemoryType,
} from "@neobuni/contracts";
import { makeMemory } from "@neobuni/core";
import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { Effect } from "effect";

import { db, fromPromise } from "../client";
import { memoriesTable } from "../schema";

const createMemoryRecord = makeMemory();

const parseKeywords = (value: string): string[] => {
	try {
		return JSON.parse(value) as string[];
	} catch {
		return [];
	}
};

const toMemory = (row: typeof memoriesTable.$inferSelect) => ({
	id: row.id,
	profileId: row.profileId,
	conversationId: row.conversationId,
	episodeId: row.episodeId,
	content: row.content,
	type: row.type as MemoryType,
	memoryClass: row.memoryClass as MemoryClass,
	status: row.status as MemoryStatus,
	keywords: parseKeywords(row.keywordsJson),
	importance: row.importance,
	sourceKind: row.sourceKind as MemorySourceKind,
	sourceStartTs: row.sourceStartTs,
	sourceEndTs: row.sourceEndTs,
	unresolved: row.unresolved === 1,
	createdAt: row.createdAt,
	updatedAt: row.updatedAt,
});

const listMemories = Effect.fnUntraced(function* (
	profileId: string,
	opts?: {
		type?: MemoryType;
		unresolved?: boolean;
		status?: MemoryStatus | MemoryStatus[];
	}
) {
	const filters = [
		eq(memoriesTable.profileId, profileId),
		...(opts?.type ? [eq(memoriesTable.type, opts.type)] : []),
		...(opts?.status
			? [
					inArray(
						memoriesTable.status,
						Array.isArray(opts.status) ? opts.status : [opts.status]
					),
				]
			: []),
		...(opts?.unresolved === undefined
			? []
			: [eq(memoriesTable.unresolved, opts.unresolved ? 1 : 0)]),
	];
	const rows = yield* fromPromise("listMemories", () =>
		db
			.select()
			.from(memoriesTable)
			.where(and(...filters))
			.orderBy(desc(memoriesTable.updatedAt))
	);

	return rows.map(toMemory);
});

const createMemory = Effect.fnUntraced(function* (
	profileId: string,
	input: {
		content: string;
		type: MemoryType;
		keywords: string[];
		importance: number;
		sourceStartTs: string | null;
		sourceEndTs: string | null;
		unresolved: boolean;
		conversationId?: string | null;
		episodeId?: string | null;
		memoryClass?: MemoryClass;
		status?: MemoryStatus;
		sourceKind?: MemorySourceKind;
	}
) {
	const record = createMemoryRecord({
		profileId,
		conversationId: input.conversationId ?? null,
		episodeId: input.episodeId ?? null,
		content: input.content,
		type: input.type,
		keywords: input.keywords,
		importance: input.importance,
		sourceStartTs: input.sourceStartTs,
		sourceEndTs: input.sourceEndTs,
		unresolved: input.unresolved,
		memoryClass:
			input.memoryClass ??
			(input.type === "task"
				? "task"
				: input.type === "fact" || input.type === "preference"
					? "semantic"
					: "episodic"),
		status: input.status ?? "active",
		sourceKind: input.sourceKind ?? "manual",
	});

	yield* fromPromise("createMemory", () =>
		db.insert(memoriesTable).values(record)
	);

	return toMemory(record);
});

const getMemory = Effect.fnUntraced(function* (id: string) {
	const existing = yield* fromPromise("getMemory", () =>
		db
			.select()
			.from(memoriesTable)
			.where(eq(memoriesTable.id, id))
			.limit(1)
			.then((rows) => rows[0] ?? null)
	);

	return existing ? toMemory(existing) : null;
});

const getMemoriesByIdsWithStatuses = Effect.fnUntraced(function* (
	ids: string[],
	opts?: { status?: MemoryStatus | MemoryStatus[] }
) {
	if (ids.length === 0) {
		return [];
	}
	const rows = yield* fromPromise("getMemoriesByIdsWithStatuses", () =>
		db
			.select()
			.from(memoriesTable)
			.where(
				and(
					inArray(memoriesTable.id, ids),
					...(opts?.status
						? [
								inArray(
									memoriesTable.status,
									Array.isArray(opts.status) ? opts.status : [opts.status]
								),
							]
						: [])
				)
			)
	);

	return rows.map(toMemory);
});

const getMemoriesByIds = Effect.fnUntraced(function* (ids: string[]) {
	if (ids.length === 0) {
		return [];
	}
	return yield* getMemoriesByIdsWithStatuses(ids);
});

const updateMemory = Effect.fnUntraced(function* (
	id: string,
	input: Partial<{
		content: string;
		type: MemoryType;
		keywords: string[];
		importance: number;
		sourceStartTs: string | null;
		sourceEndTs: string | null;
		unresolved: boolean;
		conversationId: string | null;
		episodeId: string | null;
		memoryClass: MemoryClass;
		status: MemoryStatus;
		sourceKind: MemorySourceKind;
	}>
) {
	const current = yield* fromPromise("updateMemory", () =>
		db
			.select()
			.from(memoriesTable)
			.where(eq(memoriesTable.id, id))
			.limit(1)
			.then((rows) => rows[0] ?? null)
	);
	if (!current) {
		return null;
	}

	const next = {
		content: input.content ?? current.content,
		type: input.type ?? current.type,
		keywordsJson:
			input.keywords === undefined
				? current.keywordsJson
				: JSON.stringify(input.keywords),
		importance: input.importance ?? current.importance,
		sourceStartTs:
			input.sourceStartTs === undefined
				? current.sourceStartTs
				: input.sourceStartTs,
		sourceEndTs:
			input.sourceEndTs === undefined ? current.sourceEndTs : input.sourceEndTs,
		conversationId:
			input.conversationId === undefined
				? current.conversationId
				: input.conversationId,
		episodeId:
			input.episodeId === undefined ? current.episodeId : input.episodeId,
		memoryClass: input.memoryClass ?? current.memoryClass,
		status: input.status ?? current.status,
		sourceKind: input.sourceKind ?? current.sourceKind,
		unresolved:
			input.unresolved === undefined
				? current.unresolved
				: input.unresolved
					? 1
					: 0,
		updatedAt: new Date().toISOString(),
	};

	yield* fromPromise("updateMemory", () =>
		db.update(memoriesTable).set(next).where(eq(memoriesTable.id, id))
	);

	return toMemory({ ...current, ...next });
});

const deleteMemory = Effect.fnUntraced(function* (id: string) {
	yield* fromPromise("deleteMemory", () =>
		db.delete(memoriesTable).where(eq(memoriesTable.id, id))
	);
});

const searchMemoriesByText = Effect.fnUntraced(function* (
	profileId: string,
	query: string
) {
	const pattern = `%${query}%`;
	const rows = yield* fromPromise("searchMemoriesByText", () =>
		db
			.select()
			.from(memoriesTable)
			.where(
				and(
					eq(memoriesTable.profileId, profileId),
					or(
						like(memoriesTable.content, pattern),
						like(memoriesTable.keywordsJson, pattern)
					)
				)
			)
			.orderBy(desc(memoriesTable.updatedAt))
	);

	return rows.map(toMemory);
});

const listUnresolvedMemories = Effect.fnUntraced(function* (
	profileId: string,
	limit: number
) {
	const rows = yield* fromPromise("listUnresolvedMemories", () =>
		db
			.select()
			.from(memoriesTable)
			.where(
				and(
					eq(memoriesTable.profileId, profileId),
					eq(memoriesTable.status, "active"),
					eq(memoriesTable.unresolved, 1)
				)
			)
			.orderBy(desc(memoriesTable.updatedAt))
			.limit(limit)
	);

	return rows.map(toMemory);
});

const listRecentMemories = Effect.fnUntraced(function* (
	profileId: string,
	sinceDaysAgo: number,
	limit: number
) {
	const since = new Date(
		Date.now() - sinceDaysAgo * 24 * 60 * 60 * 1000
	).toISOString();

	const rows = yield* fromPromise("listRecentMemories", () =>
		db
			.select()
			.from(memoriesTable)
			.where(
				and(
					eq(memoriesTable.profileId, profileId),
					eq(memoriesTable.status, "active")
				)
			)
			.orderBy(desc(memoriesTable.createdAt))
			.limit(limit * 3)
	);

	return rows
		.filter((r) => r.createdAt >= since)
		.slice(0, limit)
		.map(toMemory);
});

export {
	createMemory,
	deleteMemory,
	getMemoriesByIds,
	getMemoriesByIdsWithStatuses,
	getMemory,
	listMemories,
	listRecentMemories,
	listUnresolvedMemories,
	searchMemoriesByText,
	updateMemory,
};
