import { Effect } from "effect";

import { fromPromise, getClient } from "../client";

const toBytes = (embedding: Float32Array) =>
	new Uint8Array(embedding.buffer, embedding.byteOffset, embedding.byteLength);

const upsertKnowledgeChunkEmbeddingAsync = async (
	chunkId: string,
	embedding: Float32Array
) => {
	await getClient().execute({
		sql: "INSERT OR REPLACE INTO vec_knowledge_chunks(chunk_id, embedding) VALUES (?, vector32(?))",
		args: [chunkId, toBytes(embedding)],
	});
};

const deleteKnowledgeChunkEmbeddingAsync = async (chunkId: string) => {
	await getClient().execute({
		sql: "DELETE FROM vec_knowledge_chunks WHERE chunk_id = ?",
		args: [chunkId],
	});
};

const searchSimilarKnowledgeChunksAsync = async (
	queryEmbedding: Float32Array,
	limit: number
): Promise<Array<{ chunkId: string; distance: number }>> => {
	const bytes = toBytes(queryEmbedding);
	const result = await getClient().execute({
		sql: `
      SELECT v.chunk_id AS chunk_id,
             vector_distance_cos(v.embedding, vector32(?)) AS distance
      FROM vector_top_k('vec_knowledge_chunks_idx', vector32(?), ?) AS t
      JOIN vec_knowledge_chunks AS v ON v.rowid = t.id
      ORDER BY distance ASC
    `,
		args: [bytes, bytes, limit],
	});

	return result.rows.map((row) => ({
		chunkId: String(row.chunk_id),
		distance: Number(row.distance),
	}));
};

export const upsertKnowledgeChunkEmbedding = Effect.fnUntraced(function* (
	chunkId: string,
	embedding: Float32Array
) {
	yield* fromPromise("upsertKnowledgeChunkEmbedding", () =>
		upsertKnowledgeChunkEmbeddingAsync(chunkId, embedding)
	);
});

export const deleteKnowledgeChunkEmbedding = Effect.fnUntraced(function* (
	chunkId: string
) {
	yield* fromPromise("deleteKnowledgeChunkEmbedding", () =>
		deleteKnowledgeChunkEmbeddingAsync(chunkId)
	);
});

export const searchSimilarKnowledgeChunks = Effect.fnUntraced(function* (
	queryEmbedding: Float32Array,
	limit: number
) {
	return yield* fromPromise("searchSimilarKnowledgeChunks", () =>
		searchSimilarKnowledgeChunksAsync(queryEmbedding, limit)
	);
});
