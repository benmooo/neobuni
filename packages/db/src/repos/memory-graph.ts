import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { Effect } from "effect";

import { db, fromPromise } from "../client";
import {
	memoryGraphEdgesTable,
	memoryGraphNodesTable,
	memoryGraphSourcesTable,
} from "../schema";

type MemoryGraphNodeKind = "topic" | "entity" | "event" | "task";
type MemoryGraphSourceType =
	| "message"
	| "memory"
	| "knowledge_chunk"
	| "manual";
type MemoryGraphTargetKind = "node" | "edge";

const now = () => new Date().toISOString();

const normalizeCanonicalName = (value: string) => value.trim().toLowerCase();

const parsePayload = (value: string | null) => {
	if (!value) {
		return null;
	}

	try {
		return JSON.parse(value) as Record<string, unknown>;
	} catch {
		return null;
	}
};

const toNode = (row: typeof memoryGraphNodesTable.$inferSelect) => ({
	id: row.id,
	profileId: row.profileId,
	kind: row.kind as MemoryGraphNodeKind,
	canonicalName: row.canonicalName,
	summary: row.summary,
	status: row.status,
	payload: parsePayload(row.payloadJson),
	createdAt: row.createdAt,
	updatedAt: row.updatedAt,
});

const toEdge = (row: typeof memoryGraphEdgesTable.$inferSelect) => ({
	id: row.id,
	profileId: row.profileId,
	fromNodeId: row.fromNodeId,
	relationType: row.relationType,
	toNodeId: row.toNodeId,
	weight: row.weight,
	sourceType: row.sourceType as MemoryGraphSourceType,
	sourceId: row.sourceId,
	validFromTs: row.validFromTs,
	validToTs: row.validToTs,
	createdAt: row.createdAt,
	updatedAt: row.updatedAt,
});

const toSource = (row: typeof memoryGraphSourcesTable.$inferSelect) => ({
	id: row.id,
	profileId: row.profileId,
	targetKind: row.targetKind as MemoryGraphTargetKind,
	targetId: row.targetId,
	sourceType: row.sourceType as MemoryGraphSourceType,
	sourceId: row.sourceId,
	evidenceText: row.evidenceText,
	confidence: row.confidence,
	createdAt: row.createdAt,
});

const findMemoryGraphNodeByCanonicalName = Effect.fnUntraced(function* (
	profileId: string,
	kind: MemoryGraphNodeKind,
	canonicalName: string
) {
	const normalized = normalizeCanonicalName(canonicalName);
	const row = yield* fromPromise("findMemoryGraphNodeByCanonicalName", () =>
		db
			.select()
			.from(memoryGraphNodesTable)
			.where(
				and(
					eq(memoryGraphNodesTable.profileId, profileId),
					eq(memoryGraphNodesTable.kind, kind),
					eq(memoryGraphNodesTable.canonicalName, normalized)
				)
			)
			.limit(1)
			.then((rows) => rows[0] ?? null)
	);

	return row ? toNode(row) : null;
});

const upsertMemoryGraphNode = Effect.fnUntraced(function* (
	profileId: string,
	input: {
		kind: MemoryGraphNodeKind;
		canonicalName: string;
		summary: string;
		status?: string;
		payload?: Record<string, unknown> | null;
	}
) {
	const existing = yield* findMemoryGraphNodeByCanonicalName(
		profileId,
		input.kind,
		input.canonicalName
	);
	const timestamp = now();

	if (existing) {
		const next = {
			summary: input.summary,
			status: input.status ?? existing.status,
			payloadJson: input.payload ? JSON.stringify(input.payload) : null,
			updatedAt: timestamp,
		};

		yield* fromPromise("upsertMemoryGraphNode", () =>
			db
				.update(memoryGraphNodesTable)
				.set(next)
				.where(eq(memoryGraphNodesTable.id, existing.id))
		);

		return {
			...existing,
			summary: next.summary,
			status: next.status,
			payload: input.payload ?? null,
			updatedAt: timestamp,
		};
	}

	const record = {
		id: crypto.randomUUID(),
		profileId,
		kind: input.kind,
		canonicalName: normalizeCanonicalName(input.canonicalName),
		summary: input.summary,
		status: input.status ?? "active",
		payloadJson: input.payload ? JSON.stringify(input.payload) : null,
		createdAt: timestamp,
		updatedAt: timestamp,
	};

	yield* fromPromise("upsertMemoryGraphNode", () =>
		db.insert(memoryGraphNodesTable).values(record)
	);

	return toNode(record);
});

const upsertMemoryGraphEdge = Effect.fnUntraced(function* (
	profileId: string,
	input: {
		fromNodeId: string;
		relationType: string;
		toNodeId: string;
		weight?: number;
		sourceType: MemoryGraphSourceType;
		sourceId: string;
		validFromTs?: string | null;
		validToTs?: string | null;
	}
) {
	const existing = yield* fromPromise("upsertMemoryGraphEdge", () =>
		db
			.select()
			.from(memoryGraphEdgesTable)
			.where(
				and(
					eq(memoryGraphEdgesTable.profileId, profileId),
					eq(memoryGraphEdgesTable.fromNodeId, input.fromNodeId),
					eq(memoryGraphEdgesTable.relationType, input.relationType),
					eq(memoryGraphEdgesTable.toNodeId, input.toNodeId),
					eq(memoryGraphEdgesTable.sourceType, input.sourceType),
					eq(memoryGraphEdgesTable.sourceId, input.sourceId)
				)
			)
			.limit(1)
			.then((rows) => rows[0] ?? null)
	);
	const timestamp = now();

	if (existing) {
		const next = {
			weight: input.weight ?? existing.weight,
			validFromTs: input.validFromTs ?? existing.validFromTs,
			validToTs: input.validToTs ?? existing.validToTs,
			updatedAt: timestamp,
		};

		yield* fromPromise("upsertMemoryGraphEdge", () =>
			db
				.update(memoryGraphEdgesTable)
				.set(next)
				.where(eq(memoryGraphEdgesTable.id, existing.id))
		);

		return toEdge({
			...existing,
			...next,
		});
	}

	const record = {
		id: crypto.randomUUID(),
		profileId,
		fromNodeId: input.fromNodeId,
		relationType: input.relationType,
		toNodeId: input.toNodeId,
		weight: input.weight ?? 1,
		sourceType: input.sourceType,
		sourceId: input.sourceId,
		validFromTs: input.validFromTs ?? null,
		validToTs: input.validToTs ?? null,
		createdAt: timestamp,
		updatedAt: timestamp,
	};

	yield* fromPromise("upsertMemoryGraphEdge", () =>
		db.insert(memoryGraphEdgesTable).values(record)
	);

	return toEdge(record);
});

const createMemoryGraphSource = Effect.fnUntraced(function* (
	profileId: string,
	input: {
		targetKind: MemoryGraphTargetKind;
		targetId: string;
		sourceType: MemoryGraphSourceType;
		sourceId: string;
		evidenceText: string;
		confidence?: number;
	}
) {
	const existing = yield* fromPromise("createMemoryGraphSource", () =>
		db
			.select()
			.from(memoryGraphSourcesTable)
			.where(
				and(
					eq(memoryGraphSourcesTable.profileId, profileId),
					eq(memoryGraphSourcesTable.targetKind, input.targetKind),
					eq(memoryGraphSourcesTable.targetId, input.targetId),
					eq(memoryGraphSourcesTable.sourceType, input.sourceType),
					eq(memoryGraphSourcesTable.sourceId, input.sourceId),
					eq(memoryGraphSourcesTable.evidenceText, input.evidenceText)
				)
			)
			.limit(1)
			.then((rows) => rows[0] ?? null)
	);

	if (existing) {
		return toSource(existing);
	}

	const record = {
		id: crypto.randomUUID(),
		profileId,
		targetKind: input.targetKind,
		targetId: input.targetId,
		sourceType: input.sourceType,
		sourceId: input.sourceId,
		evidenceText: input.evidenceText,
		confidence: input.confidence ?? 0.6,
		createdAt: now(),
	};

	yield* fromPromise("createMemoryGraphSource", () =>
		db.insert(memoryGraphSourcesTable).values(record)
	);

	return toSource(record);
});

const scoreNodeMatch = (node: ReturnType<typeof toNode>, terms: string[]) => {
	const canonical = normalizeCanonicalName(node.canonicalName);
	const summary = node.summary.toLowerCase();

	return terms.reduce((best, term) => {
		if (canonical === term) {
			return Math.max(best, 1);
		}

		if (canonical.includes(term)) {
			return Math.max(best, 0.88);
		}

		if (summary.includes(term)) {
			return Math.max(best, 0.62);
		}

		return best;
	}, 0);
};

const searchMemoryGraphNodes = Effect.fnUntraced(function* (
	profileId: string,
	input: {
		terms: string[];
		limit: number;
	}
) {
	const terms = Array.from(
		new Set(
			input.terms.map(normalizeCanonicalName).filter((term) => term.length > 0)
		)
	);

	if (terms.length === 0) {
		return [];
	}

	const filters = terms.flatMap((term) => [
		like(memoryGraphNodesTable.canonicalName, `%${term}%`),
		like(memoryGraphNodesTable.summary, `%${term}%`),
	]);

	const rows = yield* fromPromise("searchMemoryGraphNodes", () =>
		db
			.select()
			.from(memoryGraphNodesTable)
			.where(
				and(eq(memoryGraphNodesTable.profileId, profileId), or(...filters))
			)
			.orderBy(desc(memoryGraphNodesTable.updatedAt))
	);

	return rows
		.map((row) => toNode(row))
		.map((node) => ({
			...node,
			matchScore: scoreNodeMatch(node, terms),
		}))
		.filter((node) => node.matchScore > 0)
		.sort((left, right) => right.matchScore - left.matchScore)
		.slice(0, input.limit);
});

const getMemoryGraphNodesByIds = Effect.fnUntraced(function* (ids: string[]) {
	if (ids.length === 0) {
		return [];
	}

	const rows = yield* fromPromise("getMemoryGraphNodesByIds", () =>
		db
			.select()
			.from(memoryGraphNodesTable)
			.where(inArray(memoryGraphNodesTable.id, ids))
	);

	return rows.map(toNode);
});

const listMemoryGraphEdgesForNodeIds = Effect.fnUntraced(function* (
	profileId: string,
	input: {
		nodeIds: string[];
		relationTypes?: string[];
		limit: number;
	}
) {
	if (input.nodeIds.length === 0) {
		return [];
	}

	const rows = yield* fromPromise("listMemoryGraphEdgesForNodeIds", () =>
		db
			.select()
			.from(memoryGraphEdgesTable)
			.where(
				and(
					eq(memoryGraphEdgesTable.profileId, profileId),
					or(
						inArray(memoryGraphEdgesTable.fromNodeId, input.nodeIds),
						inArray(memoryGraphEdgesTable.toNodeId, input.nodeIds)
					),
					...(input.relationTypes && input.relationTypes.length > 0
						? [inArray(memoryGraphEdgesTable.relationType, input.relationTypes)]
						: [])
				)
			)
			.orderBy(desc(memoryGraphEdgesTable.weight))
			.limit(input.limit)
	);

	return rows.map(toEdge);
});

const listMemoryGraphSourcesForTargetIds = Effect.fnUntraced(function* (
	profileId: string,
	targetKind: MemoryGraphTargetKind,
	targetIds: string[]
) {
	if (targetIds.length === 0) {
		return [];
	}

	const rows = yield* fromPromise("listMemoryGraphSourcesForTargetIds", () =>
		db
			.select()
			.from(memoryGraphSourcesTable)
			.where(
				and(
					eq(memoryGraphSourcesTable.profileId, profileId),
					eq(memoryGraphSourcesTable.targetKind, targetKind),
					inArray(memoryGraphSourcesTable.targetId, targetIds)
				)
			)
			.orderBy(desc(memoryGraphSourcesTable.createdAt))
	);

	return rows.map(toSource);
});

export type {
	MemoryGraphNodeKind,
	MemoryGraphSourceType,
	MemoryGraphTargetKind,
};
export {
	createMemoryGraphSource,
	findMemoryGraphNodeByCanonicalName,
	getMemoryGraphNodesByIds,
	listMemoryGraphEdgesForNodeIds,
	listMemoryGraphSourcesForTargetIds,
	searchMemoryGraphNodes,
	upsertMemoryGraphEdge,
	upsertMemoryGraphNode,
};
