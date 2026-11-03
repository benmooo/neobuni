/**
 * Backfill vector embeddings for knowledge chunks that do not have one.
 *
 * `ingest-textbook.ts` only writes chunks and the FTS index. Textbook retrieval
 * prefers vector search, and its keyword fallback is unreliable for Chinese, so
 * a freshly ingested book produces no excerpts until this runs.
 *
 * Usage:
 *   DATABASE_URL=file:/abs/path/.data/neobuni.db \
 *   PROFILE_ID=... \
 *   bun run apps/server/scripts/embed-knowledge.ts
 */
import {
  getClient,
  getMemoryEmbeddingProviderConfig,
  runRepo,
  upsertKnowledgeChunkEmbedding,
} from "@neobuni/db";

import { embedQueryForSearch } from "../src/digest/embedding-service";
import { toOpenAICompatibleConfig } from "../src/digest/memory-provider-config";

const CONCURRENCY = 4;
const LIMIT = 1000;

const main = async () => {
  const profileId = process.env.PROFILE_ID ?? "";

  if (!profileId) {
    throw new Error("usage: PROFILE_ID=... bun run embed-knowledge.ts");
  }

  const embeddingConfig = toOpenAICompatibleConfig(
    await runRepo(getMemoryEmbeddingProviderConfig(profileId))
  );
  if (!embeddingConfig) {
    throw new Error(
      `No memory_embedding provider configured for profile ${profileId}`
    );
  }

  // The dev server keeps its own connection open, so concurrent writes need to
  // wait instead of failing with SQLITE_BUSY.
  await getClient().execute("PRAGMA busy_timeout = 15000");

  const { rows } = await getClient().execute({
    args: [profileId, LIMIT],
    sql: `SELECT c.id AS id, c.content AS content
          FROM knowledge_chunks c
          JOIN knowledge_documents d ON d.id = c.document_id
          LEFT JOIN vec_knowledge_chunks v ON v.chunk_id = c.id
          WHERE v.chunk_id IS NULL
            AND (d.profile_id = ? OR d.scope = 'global')
          ORDER BY c.created_at, c.chunk_index
          LIMIT ?`,
  });

  console.log(`chunks to embed: ${rows.length}`);

  let cursor = 0;
  let done = 0;
  const worker = async () => {
    while (cursor < rows.length) {
      const row = rows[cursor];
      cursor += 1;
      if (!row) {
        continue;
      }

      const embedding = await embedQueryForSearch(
        embeddingConfig,
        String(row.content ?? "")
      );
      await runRepo(
        upsertKnowledgeChunkEmbedding(String(row.id ?? ""), embedding)
      );

      done += 1;
      if (done % 25 === 0) {
        console.log(`  embedded ${done}/${rows.length}`);
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, async () => worker()));
  console.log(`done: ${done} chunks embedded`);
};

await main();
