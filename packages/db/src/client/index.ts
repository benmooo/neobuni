import { existsSync, mkdirSync } from "node:fs";
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

interface DatabaseConfig {
  authToken?: string;
  url: string;
}

const resolveDefaultUrl = () => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  return `file:${process.cwd()}/.data/neobuni.db`;
};

const createDrizzle = (client: Client) => drizzle({ client, relations });

export type Database = ReturnType<typeof createDrizzle>;

interface DatabaseState {
  client: Client;
  config: DatabaseConfig;
  db: Database;
}

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

/**
 * Database URLs can carry credentials, and the server's env guard rejects any
 * payload that contains a sensitive env value, so runtime summaries only ever
 * expose a redacted form.
 */
export const redactDatabaseUrl = (url: string): string => {
  if (url.startsWith("file:")) {
    const name = url.split("/").filter(Boolean).at(-1) ?? "database";
    return `file:${name}`;
  }
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "configured";
  }
};

const resolveDatabaseUrl = () => state?.config.url ?? resolveDefaultUrl();

const filePathOf = (url: string): string => {
  if (!url.startsWith("file:")) {
    return redactDatabaseUrl(url);
  }

  const path = url.slice("file:".length);
  return path.split("/").filter(Boolean).at(-1) ?? "database";
};

const localPathOf = (url: string): string | null =>
  url.startsWith("file:") ? url.slice("file:".length) : null;

const vectorTableStatus = async () => {
  const client = ensureState().client;
  const status = {
    actualDimensions: null as number | null,
    extensionLoaded: false,
    schemaReady: false,
    tableExists: false,
    tableQueryable: false,
  };

  try {
    await client.execute("SELECT vector_extract(vector('[1.0]')) AS probe");
    status.extensionLoaded = true;
  } catch {
    status.extensionLoaded = false;
  }

  try {
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'vec_memories'"
    );
    status.tableExists = tables.rows.length > 0;
  } catch {
    return status;
  }

  if (!(status.tableExists && status.extensionLoaded)) {
    return status;
  }

  try {
    const columns = await client.execute("PRAGMA table_info(vec_memories)");
    const embedding = columns.rows.find(
      (row) => String(row.name ?? "") === "embedding"
    );
    const declared = String(embedding?.type ?? "");
    const match = /F32_BLOB\((\d+)\)/.exec(declared);
    status.actualDimensions = match?.[1] ? Number(match[1]) : null;
    const hasMemoryId = columns.rows.some(
      (row) => String(row.name ?? "") === "memory_id"
    );
    status.schemaReady =
      hasMemoryId && status.actualDimensions === MEMORY_EMBEDDING_DIMENSIONS;
  } catch {
    status.schemaReady = false;
  }

  try {
    await client.execute("SELECT memory_id FROM vec_memories LIMIT 1");
    status.tableQueryable = true;
  } catch {
    status.tableQueryable = false;
  }

  return status;
};

/**
 * Live readiness probe behind the ops dashboard. Reports only the database
 * file name (or the redacted remote origin) so the runtime summary can never
 * echo a sensitive env value.
 */
export const getDatabaseHealth = async () => {
  const url = resolveDatabaseUrl();
  const localPath = localPathOf(url);
  const filePath = filePathOf(url);
  const fileExists =
    localPath === null
      ? true
      : localPath.startsWith(":memory:") || existsSync(localPath);

  let reachable = false;
  try {
    await ensureState().client.execute("SELECT 1");
    reachable = true;
  } catch {
    reachable = false;
  }

  const vector = reachable
    ? await vectorTableStatus()
    : {
        actualDimensions: null,
        extensionLoaded: false,
        schemaReady: false,
        tableExists: false,
        tableQueryable: false,
      };

  return {
    overallReady:
      reachable &&
      vector.extensionLoaded &&
      vector.schemaReady &&
      vector.tableQueryable,
    main: { fileExists, filePath, reachable },
    vector: {
      ...vector,
      expectedDimensions: MEMORY_EMBEDDING_DIMENSIONS,
      fileExists,
      filePath,
      reachable: vector.tableQueryable,
    },
  };
};

export { schema };
