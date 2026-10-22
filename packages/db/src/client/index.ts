import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Effect, Schema } from "effect";

import { relations } from "../relations";
import * as schema from "../schema";

export const MEMORY_EMBEDDING_DIMENSIONS = 1024;

export class DbError extends Schema.TaggedError<DbError>()("DbError", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * Adapter between the promise-based libsql drizzle driver and Effect.
 *
 * drizzle's native Effect driver is unusable with Effect 4.0.5 (it references
 * `Schema.TaggedErrorClass`, which no longer exists), so repos keep the async
 * driver internally and expose Effects through this boundary.
 */
export const fromPromise = <A>(
  operation: string,
  run: () => Promise<A>
): Effect.Effect<A, DbError> =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new DbError({ operation, cause }),
  });

type DatabaseConfig = {
  url: string;
  authToken?: string;
};

const resolveDefaultUrl = () => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  return `file:${process.cwd()}/.data/neobuni.db`;
};

let activeConfig: DatabaseConfig = { url: resolveDefaultUrl() };
let activeClient = createClient(activeConfig);
let activeDb = drizzle({ client: activeClient, relations });

export const configureDatabase = (config: DatabaseConfig) => {
  if (config.url === activeConfig.url && config.authToken === activeConfig.authToken) {
    return activeDb;
  }

  activeConfig = config;
  activeClient = createClient(config);
  activeDb = drizzle({ client: activeClient, relations });

  return activeDb;
};

/** Configured drizzle client. Use `configureDatabase` at process bootstrap. */
export const db = new Proxy({} as typeof activeDb, {
  get: (_target, property, receiver) => Reflect.get(activeDb, property, receiver),
});

export const getClient = (): Client => activeClient;

const ensureKnowledgeSchema = async () => {
  await activeClient.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS fts_knowledge_chunks USING fts5(
      chunk_id UNINDEXED,
      content,
      keywords
    );
  `);
};

const ensureVectorSchema = async () => {
  await activeClient.execute(`
    CREATE TABLE IF NOT EXISTS vec_memories (
      memory_id TEXT PRIMARY KEY,
      embedding F32_BLOB(${MEMORY_EMBEDDING_DIMENSIONS})
    );
  `);
  await activeClient.execute(`
    CREATE TABLE IF NOT EXISTS vec_knowledge_chunks (
      chunk_id TEXT PRIMARY KEY,
      embedding F32_BLOB(${MEMORY_EMBEDDING_DIMENSIONS})
    );
  `);
  await activeClient.execute(`
    CREATE INDEX IF NOT EXISTS vec_memories_idx
      ON vec_memories (libsql_vector_idx(embedding));
  `);
  await activeClient.execute(`
    CREATE INDEX IF NOT EXISTS vec_knowledge_chunks_idx
      ON vec_knowledge_chunks (libsql_vector_idx(embedding));
  `);
};

/**
 * Runtime-only structures (virtual tables, vector indexes). The main schema is
 * owned by drizzle-kit.
 */
export const ensureSchema = async () => {
  await ensureKnowledgeSchema();
  await ensureVectorSchema();
};

export const ensureSchemaEffect = fromPromise("ensureSchema", ensureSchema);

export const getDatabaseRuntimeStatus = () => ({
  ready: true,
  engine: "libsql",
  url: activeConfig.url,
  vectorDimensions: MEMORY_EMBEDDING_DIMENSIONS,
});

export { schema };
