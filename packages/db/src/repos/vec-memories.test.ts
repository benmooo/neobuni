import type { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { DbError, ensureSchema, MEMORY_EMBEDDING_DIMENSIONS } from "../client";
import { runRepo } from "../run";
import {
	executeStatements,
	setupTestDatabase,
	type TestDatabase,
} from "../testing/test-database";
import {
	clearMemoryEmbeddings,
	deleteMemoryEmbedding,
	searchSimilarMemories,
	upsertMemoryEmbedding,
} from "./vec-memories";

let testDatabase: TestDatabase;

const embeddingAt = (primary: number, secondary = 0) => {
	const embedding = new Float32Array(MEMORY_EMBEDDING_DIMENSIONS);
	embedding[0] = primary;
	embedding[1] = secondary;
	return embedding;
};

describe("vec memories repo", () => {
	beforeAll(async () => {
		testDatabase = await setupTestDatabase("vec-memories");
	});

	afterAll(() => {
		testDatabase.cleanup();
	});

	test("fails with a typed DbError when vec_memories table is unavailable", async () => {
		await executeStatements([
			"DROP INDEX IF EXISTS vec_memories_idx",
			"DROP TABLE IF EXISTS vec_memories",
		]);

		const embedding = embeddingAt(0.1, 0.2);
		const expectDbError = async (effect: Effect.Effect<unknown, DbError>) => {
			const error: unknown = await runRepo(effect).catch(
				(cause: unknown) => cause
			);

			expect(error).toBeInstanceOf(DbError);
			expect(error).toMatchObject({ _tag: "DbError" });
		};

		await expectDbError(upsertMemoryEmbedding("memory-1", embedding));
		await expectDbError(deleteMemoryEmbedding("memory-1"));
		await expectDbError(clearMemoryEmbeddings);
		await expectDbError(searchSimilarMemories(embedding, 5));
	});

	test("stores, searches, deletes and clears embeddings once the vector schema exists", async () => {
		await ensureSchema();

		const query = embeddingAt(1);
		await runRepo(upsertMemoryEmbedding("memory-1", query));
		await runRepo(upsertMemoryEmbedding("memory-2", embeddingAt(0.9, 0.1)));

		const matches = await runRepo(searchSimilarMemories(query, 5));

		expect(matches.map((match) => match.memoryId)).toEqual([
			"memory-1",
			"memory-2",
		]);
		expect(matches[0]?.distance).toBeCloseTo(0, 5);
		expect(matches[1]?.distance).toBeGreaterThan(matches[0]?.distance ?? 0);

		await runRepo(deleteMemoryEmbedding("memory-1"));
		expect(await runRepo(searchSimilarMemories(query, 5))).toMatchObject([
			{ memoryId: "memory-2" },
		]);

		await runRepo(clearMemoryEmbeddings);
		expect(await runRepo(searchSimilarMemories(query, 5))).toEqual([]);
	});
});
