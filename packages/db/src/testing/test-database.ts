import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { configureDatabase, ensureSchema, getClient } from "../client";

const MIGRATIONS_DIRECTORY = join(
  dirname(fileURLToPath(import.meta.url)),
  "../migrations"
);

const STATEMENT_BREAKPOINT = "--> statement-breakpoint";

interface TestDatabase {
  cleanup: () => void;
  path: string;
  url: string;
}

const splitStatements = (sql: string): string[] =>
  sql
    .split(STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

const readMigrationStatements = (): string[] =>
  readdirSync(MIGRATIONS_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .flatMap((directory) =>
      splitStatements(
        readFileSync(
          join(MIGRATIONS_DIRECTORY, directory, "migration.sql"),
          "utf8"
        )
      )
    );

/**
 * Points the shared client at a fresh temp database, applies the generated
 * drizzle-kit migrations, and provisions the runtime-only schema.
 */
const setupTestDatabase = async (prefix: string): Promise<TestDatabase> => {
  const path = join(
    tmpdir(),
    `neobuni-test-${prefix}-${process.pid}-${Date.now()}-${randomUUID().slice(0, 8)}.db`
  );
  const url = `file:${path}`;

  configureDatabase({ url });
  const client = getClient();

  await client.migrate(readMigrationStatements());
  await ensureSchema();

  return {
    url,
    path,
    cleanup: () => {
      client.close();
      for (const suffix of ["", "-wal", "-shm"]) {
        rmSync(`${path}${suffix}`, { force: true });
      }
    },
  };
};

const executeStatements = async (statements: readonly string[]) => {
  await getClient().batch([...statements]);
};

export type { TestDatabase };
export { executeStatements, setupTestDatabase };
