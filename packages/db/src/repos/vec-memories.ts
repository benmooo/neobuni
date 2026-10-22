import { Effect } from "effect";

import { fromPromise, getClient } from "../client";

const toBytes = (embedding: Float32Array) =>
	new Uint8Array(embedding.buffer, embedding.byteOffset, embedding.byteLength);

const upsertMemoryEmbeddingAsync = async (
	memoryId: string,
	embedding: Float32Array
) => {
	await getClient().execute({
		sql: "INSERT OR REPLACE INTO vec_memories(memory_id, embedding) VALUES (?, vector32(?))",
		args: [memoryId, toBytes(embedding)],
	});
};

const deleteMemoryEmbeddingAsync = async (memoryId: string) => {
	await getClient().execute({
		sql: "DELETE FROM vec_memories WHERE memory_id = ?",
		args: [memoryId],
	});
};

const clearMemoryEmbeddingsAsync = async () => {
	await getClient().execute("DELETE FROM vec_memories");
};

const searchSimilarMemoriesAsync = async (
	queryEmbedding: Float32Array,
	limit: number
): Promise<Array<{ memoryId: string; distance: number }>> => {
	const bytes = toBytes(queryEmbedding);
	const result = await getClient().execute({
		sql: `
      SELECT v.memory_id AS memory_id,
             vector_distance_cos(v.embedding, vector32(?)) AS distance
      FROM vector_top_k('vec_memories_idx', vector32(?), ?) AS t
      JOIN vec_memories AS v ON v.rowid = t.id
      ORDER BY distance ASC
    `,
		args: [bytes, bytes, limit],
	});

	return result.rows.map((row) => ({
		memoryId: String(row.memory_id),
		distance: Number(row.distance),
	}));
};

export const upsertMemoryEmbedding = Effect.fnUntraced(function* (
	memoryId: string,
	embedding: Float32Array
) {
	yield* fromPromise("upsertMemoryEmbedding", () =>
		upsertMemoryEmbeddingAsync(memoryId, embedding)
	);
});

export const deleteMemoryEmbedding = Effect.fnUntraced(function* (
	memoryId: string
) {
	yield* fromPromise("deleteMemoryEmbedding", () =>
		deleteMemoryEmbeddingAsync(memoryId)
	);
});

export const clearMemoryEmbeddings = fromPromise(
	"clearMemoryEmbeddings",
	clearMemoryEmbeddingsAsync
);

export const searchSimilarMemories = Effect.fnUntraced(function* (
	queryEmbedding: Float32Array,
	limit: number
) {
	return yield* fromPromise("searchSimilarMemories", () =>
		searchSimilarMemoriesAsync(queryEmbedding, limit)
	);
});
