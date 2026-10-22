import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";

import {
	configureDatabase,
	ensureSchema,
	getClient,
	getDatabaseRuntimeStatus,
	MEMORY_EMBEDDING_DIMENSIONS,
} from "./index";

const uniqueDatabasePath = (label: string) =>
	join(
		tmpdir(),
		`neobuni-client-${label}-${process.pid}-${Date.now()}-${randomUUID().slice(0, 8)}.db`
	);

const databasePath = uniqueDatabasePath("main");
const databaseUrl = `file:${databasePath}`;
const secondaryDatabasePath = uniqueDatabasePath("secondary");
const secondaryDatabaseUrl = `file:${secondaryDatabasePath}`;

const removeDatabaseFiles = (path: string) => {
	for (const suffix of ["", "-wal", "-shm"]) {
		rmSync(`${path}${suffix}`, { force: true });
	}
};

describe("db client libsql configuration", () => {
	afterAll(() => {
		removeDatabaseFiles(databasePath);
		removeDatabaseFiles(secondaryDatabasePath);
	});

	test("opens a durable file database and reports libsql runtime status", async () => {
		configureDatabase({ url: databaseUrl });

		const probe = await getClient().execute("SELECT 1 AS value");

		expect(probe.rows[0]?.value).toBe(1);
		expect(getDatabaseRuntimeStatus()).toEqual({
			ready: true,
			engine: "libsql",
			url: databaseUrl,
			vectorDimensions: MEMORY_EMBEDDING_DIMENSIONS,
		});

		await getClient().execute(
			"CREATE TABLE client_durability (id TEXT PRIMARY KEY, value TEXT NOT NULL)"
		);
		await getClient().execute({
			sql: "INSERT INTO client_durability (id, value) VALUES (?, ?)",
			args: ["row-1", "persisted"],
		});

		// Re-opening the same file (after pointing the client elsewhere) must
		// observe the committed row, i.e. writes are durable rather than
		// connection scoped.
		getClient().close();
		configureDatabase({ url: secondaryDatabaseUrl });
		getClient().close();
		configureDatabase({ url: databaseUrl });

		const reloaded = await getClient().execute(
			"SELECT value FROM client_durability WHERE id = 'row-1'"
		);

		expect(reloaded.rows[0]?.value).toBe("persisted");
	});

	test("provisions vector and full-text tables next to the main schema", async () => {
		await ensureSchema();

		const tables = await getClient().execute(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('vec_memories', 'vec_knowledge_chunks', 'fts_knowledge_chunks')"
		);
		const indexes = await getClient().execute(
			"SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('vec_memories_idx', 'vec_knowledge_chunks_idx')"
		);

		expect(tables.rows.map((row) => row.name).sort()).toEqual([
			"fts_knowledge_chunks",
			"vec_knowledge_chunks",
			"vec_memories",
		]);
		expect(indexes.rows.map((row) => row.name).sort()).toEqual([
			"vec_knowledge_chunks_idx",
			"vec_memories_idx",
		]);
	});

	test("stores embeddings in the same database as the relational schema", async () => {
		await ensureSchema();

		const embedding = new Float32Array(MEMORY_EMBEDDING_DIMENSIONS);
		embedding[0] = 1;

		await getClient().execute({
			sql: "INSERT OR REPLACE INTO vec_memories (memory_id, embedding) VALUES (?, vector32(?))",
			args: [
				"memory-1",
				new Uint8Array(
					embedding.buffer,
					embedding.byteOffset,
					embedding.byteLength
				),
			],
		});

		const stored = await getClient().execute({
			sql: "SELECT memory_id FROM vec_memories WHERE memory_id = ?",
			args: ["memory-1"],
		});

		expect(stored.rows[0]?.memory_id).toBe("memory-1");
	});
});
