import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { type Client, createClient } from "@libsql/client";
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

const createDrizzle = (client: Client) => drizzle({ client, relations });

export type Database = ReturnType<typeof createDrizzle>;

type DatabaseState = {
	config: DatabaseConfig;
	client: Client;
	db: Database;
};

const ensureDirectory = (url: string) => {
	if (!url.startsWith("file:")) {
		return;
	}

	const path = url.slice("file:".length);

	if (path === ":memory:" || path.startsWith(":memory:")) {
		return;
	}

	mkdirSync(dirname(path), { recursive: true });
};

const openDatabase = (config: DatabaseConfig): DatabaseState => {
	ensureDirectory(config.url);
	const client = createClient(config);
	return { config, client, db: createDrizzle(client) };
};

let state: DatabaseState | null = null;

const ensureState = (): DatabaseState => {
	if (!state) {
		state = openDatabase({ url: resolveDefaultUrl() });
	}

	return state;
};

export const configureDatabase = (config: DatabaseConfig) => {
	if (
		state &&
		state.config.url === config.url &&
		state.config.authToken === config.authToken
	) {
		return state.db;
	}

	state = openDatabase(config);
	return state.db;
};

/** Configured drizzle client. Use `configureDatabase` at process bootstrap. */
export const db = new Proxy({} as Database, {
	get: (_target, property, receiver) =>
		Reflect.get(ensureState().db, property, receiver),
});

export const getClient = (): Client => ensureState().client;

const ensureKnowledgeSchema = async () => {
	await getClient().execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS fts_knowledge_chunks USING fts5(
      chunk_id UNINDEXED,
      content,
      keywords
    );
  `);
};

const ensureVectorSchema = async () => {
	await getClient().execute(`
    CREATE TABLE IF NOT EXISTS vec_memories (
      memory_id TEXT PRIMARY KEY,
      embedding F32_BLOB(${MEMORY_EMBEDDING_DIMENSIONS})
    );
  `);
	await getClient().execute(`
    CREATE TABLE IF NOT EXISTS vec_knowledge_chunks (
      chunk_id TEXT PRIMARY KEY,
      embedding F32_BLOB(${MEMORY_EMBEDDING_DIMENSIONS})
    );
  `);
	await getClient().execute(`
    CREATE INDEX IF NOT EXISTS vec_memories_idx
      ON vec_memories (libsql_vector_idx(embedding));
  `);
	await getClient().execute(`
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
	url: state?.config.url ?? resolveDefaultUrl(),
	vectorDimensions: MEMORY_EMBEDDING_DIMENSIONS,
});

export { schema };
