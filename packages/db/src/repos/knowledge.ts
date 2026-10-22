import { and, desc, eq, inArray, isNull, like, or } from "drizzle-orm";
import { Effect } from "effect";

import { db, fromPromise, getClient } from "../client";
import {
  knowledgeChunksTable,
  knowledgeDocumentsTable,
  knowledgeFactsTable,
} from "../schema";

type KnowledgeDocumentScope = "profile" | "global";
type KnowledgeDocumentTrustLevel = "imported" | "curated" | "system";

const now = () => new Date().toISOString();

const parseKeywords = (value: string): string[] => {
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
};

const toDocument = (row: typeof knowledgeDocumentsTable.$inferSelect) => ({
  id: row.id,
  profileId: row.profileId,
  scope: row.scope as KnowledgeDocumentScope,
  title: row.title,
  sourceType: row.sourceType,
  sourceUri: row.sourceUri,
  trustLevel: row.trustLevel as KnowledgeDocumentTrustLevel,
  checksum: row.checksum,
  status: row.status,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toChunk = (row: typeof knowledgeChunksTable.$inferSelect) => ({
  id: row.id,
  documentId: row.documentId,
  chunkIndex: row.chunkIndex,
  content: row.content,
  keywords: parseKeywords(row.keywordsJson),
  tokenCount: row.tokenCount,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toFact = (row: typeof knowledgeFactsTable.$inferSelect) => ({
  id: row.id,
  documentId: row.documentId,
  chunkId: row.chunkId,
  subject: row.subject,
  predicate: row.predicate,
  object: row.object,
  confidence: row.confidence,
  createdAt: row.createdAt,
});

const canAccessKnowledgeDocument = (
  profileId: string,
  document: ReturnType<typeof toDocument>
) =>
  document.profileId === profileId ||
  document.profileId === null ||
  document.scope === "global";

const createKnowledgeDocument = Effect.fnUntraced(function* (input: {
  profileId: string | null;
  scope?: KnowledgeDocumentScope;
  title: string;
  sourceType: string;
  sourceUri?: string | null;
  trustLevel?: KnowledgeDocumentTrustLevel;
  checksum?: string | null;
  status?: string;
}) {
  const timestamp = now();
  const record = {
    id: crypto.randomUUID(),
    profileId: input.profileId,
    scope: input.scope ?? "profile",
    title: input.title,
    sourceType: input.sourceType,
    sourceUri: input.sourceUri ?? null,
    trustLevel: input.trustLevel ?? "imported",
    checksum: input.checksum ?? null,
    status: input.status ?? "active",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  yield* fromPromise("createKnowledgeDocument", () =>
    db.insert(knowledgeDocumentsTable).values(record)
  );

  return toDocument(record);
});

const listKnowledgeDocumentsVisibleAsync = async (profileId: string) => {
  const documents = await db
    .select()
    .from(knowledgeDocumentsTable)
    .where(
      or(
        eq(knowledgeDocumentsTable.profileId, profileId),
        isNull(knowledgeDocumentsTable.profileId),
        eq(knowledgeDocumentsTable.scope, "global")
      )
    )
    .orderBy(desc(knowledgeDocumentsTable.updatedAt));

  return Promise.all(
    documents.map(async (row) => {
      const document = toDocument(row);
      const [chunks, facts] = await Promise.all([
        db
          .select()
          .from(knowledgeChunksTable)
          .where(eq(knowledgeChunksTable.documentId, document.id)),
        db
          .select()
          .from(knowledgeFactsTable)
          .where(eq(knowledgeFactsTable.documentId, document.id)),
      ]);

      return {
        ...document,
        chunkCount: chunks.length,
        factCount: facts.length,
      };
    })
  );
};

const listKnowledgeDocumentsVisible = Effect.fnUntraced(function* (
  profileId: string
) {
  return yield* fromPromise("listKnowledgeDocumentsVisible", () =>
    listKnowledgeDocumentsVisibleAsync(profileId)
  );
});

const findKnowledgeDocumentByChecksum = Effect.fnUntraced(function* (input: {
  checksum: string;
  profileId?: string | null;
}) {
  const filters = [
    eq(knowledgeDocumentsTable.checksum, input.checksum),
    input.profileId === undefined
      ? undefined
      : input.profileId === null
        ? isNull(knowledgeDocumentsTable.profileId)
        : eq(knowledgeDocumentsTable.profileId, input.profileId),
  ].filter((value) => value !== undefined);

  const row = yield* fromPromise("findKnowledgeDocumentByChecksum", () =>
    db
      .select()
      .from(knowledgeDocumentsTable)
      .where(and(...filters))
      .limit(1)
      .then((rows) => rows[0] ?? null)
  );

  return row ? toDocument(row) : null;
});

const createKnowledgeChunk = Effect.fnUntraced(function* (input: {
  documentId: string;
  chunkIndex: number;
  content: string;
  keywords: string[];
  tokenCount: number;
}) {
  const timestamp = now();
  const record = {
    id: crypto.randomUUID(),
    documentId: input.documentId,
    chunkIndex: input.chunkIndex,
    content: input.content,
    keywordsJson: JSON.stringify(input.keywords),
    tokenCount: input.tokenCount,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  yield* fromPromise("createKnowledgeChunk", () =>
    db.insert(knowledgeChunksTable).values(record)
  );

  return toChunk(record);
});

const createKnowledgeFacts = Effect.fnUntraced(function* (
  input: Array<{
    documentId: string;
    chunkId?: string | null;
    subject: string;
    predicate: string;
    object: string;
    confidence?: number;
  }>
) {
  if (input.length === 0) {
    return [];
  }

  const timestamp = now();
  const records = input.map((item) => ({
    id: crypto.randomUUID(),
    documentId: item.documentId,
    chunkId: item.chunkId ?? null,
    subject: item.subject,
    predicate: item.predicate,
    object: item.object,
    confidence: item.confidence ?? 0.7,
    createdAt: timestamp,
  }));

  yield* fromPromise("createKnowledgeFacts", () =>
    db.insert(knowledgeFactsTable).values(records)
  );

  return records.map(toFact);
});

const upsertKnowledgeChunkFtsAsync = async (input: {
  chunkId: string;
  content: string;
  keywords: string[];
}) => {
  await getClient().execute({
    sql: "DELETE FROM fts_knowledge_chunks WHERE chunk_id = ?",
    args: [input.chunkId],
  });
  await getClient().execute({
    sql: "INSERT INTO fts_knowledge_chunks(chunk_id, content, keywords) VALUES (?, ?, ?)",
    args: [input.chunkId, input.content, input.keywords.join(" ")],
  });
};

const upsertKnowledgeChunkFts = Effect.fnUntraced(function* (input: {
  chunkId: string;
  content: string;
  keywords: string[];
}) {
  yield* fromPromise("upsertKnowledgeChunkFts", () =>
    upsertKnowledgeChunkFtsAsync(input)
  );
});

const getKnowledgeChunksByIds = Effect.fnUntraced(function* (ids: string[]) {
  if (ids.length === 0) {
    return [];
  }

  const rows = yield* fromPromise("getKnowledgeChunksByIds", () =>
    db
      .select({
        chunk: knowledgeChunksTable,
        document: knowledgeDocumentsTable,
      })
      .from(knowledgeChunksTable)
      .innerJoin(
        knowledgeDocumentsTable,
        eq(knowledgeChunksTable.documentId, knowledgeDocumentsTable.id)
      )
      .where(inArray(knowledgeChunksTable.id, ids))
  );

  return rows.map((row) => ({
    ...toChunk(row.chunk),
    document: toDocument(row.document),
  }));
});

const getKnowledgeDocumentDetailAsync = async (
  profileId: string,
  documentId: string
) => {
  const row = await db
    .select()
    .from(knowledgeDocumentsTable)
    .where(eq(knowledgeDocumentsTable.id, documentId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!row) {
    return null;
  }

  const document = toDocument(row);

  if (!canAccessKnowledgeDocument(profileId, document)) {
    return null;
  }

  const [chunks, facts] = await Promise.all([
    db
      .select()
      .from(knowledgeChunksTable)
      .where(eq(knowledgeChunksTable.documentId, document.id))
      .orderBy(knowledgeChunksTable.chunkIndex),
    db
      .select()
      .from(knowledgeFactsTable)
      .where(eq(knowledgeFactsTable.documentId, document.id))
      .orderBy(desc(knowledgeFactsTable.confidence)),
  ]);

  return {
    ...document,
    chunkCount: chunks.length,
    factCount: facts.length,
    chunks: chunks.map(toChunk),
    facts: facts.map(toFact),
  };
};

const getKnowledgeDocumentDetail = Effect.fnUntraced(function* (
  profileId: string,
  documentId: string
) {
  return yield* fromPromise("getKnowledgeDocumentDetail", () =>
    getKnowledgeDocumentDetailAsync(profileId, documentId)
  );
});

const listKnowledgeFactsByChunkIds = Effect.fnUntraced(function* (
  chunkIds: string[]
) {
  if (chunkIds.length === 0) {
    return [];
  }

  const rows = yield* fromPromise("listKnowledgeFactsByChunkIds", () =>
    db
      .select()
      .from(knowledgeFactsTable)
      .where(inArray(knowledgeFactsTable.chunkId, chunkIds))
      .orderBy(desc(knowledgeFactsTable.confidence))
  );

  return rows.map(toFact);
});

const searchKnowledgeChunkTextAsync = async (
  query: string,
  limit: number
): Promise<Array<{ chunkId: string; score: number }>> => {
  const normalized = query.trim();

  if (normalized.length === 0) {
    return [];
  }

  try {
    const result = await getClient().execute({
      sql: "SELECT chunk_id, bm25(fts_knowledge_chunks) AS rank FROM fts_knowledge_chunks WHERE fts_knowledge_chunks MATCH ? ORDER BY rank LIMIT ?",
      args: [normalized, limit],
    });

    return result.rows.map((row) => ({
      chunkId: String(row.chunk_id),
      score: Math.max(0, 1 - Math.max(0, Number(row.rank))),
    }));
  } catch {
    return [];
  }
};

const searchKnowledgeChunkText = Effect.fnUntraced(function* (
  query: string,
  limit: number
) {
  return yield* fromPromise("searchKnowledgeChunkText", () =>
    searchKnowledgeChunkTextAsync(query, limit)
  );
});

const deleteKnowledgeChunkFtsEntriesAsync = (chunkIds: string[]) =>
  Promise.all(
    chunkIds.map((chunkId) =>
      getClient().execute({
        sql: "DELETE FROM fts_knowledge_chunks WHERE chunk_id = ?",
        args: [chunkId],
      })
    )
  );

const deleteKnowledgeChunkFtsEntries = Effect.fnUntraced(function* (
  chunkIds: string[]
) {
  yield* fromPromise("deleteKnowledgeChunkFtsEntries", () =>
    deleteKnowledgeChunkFtsEntriesAsync(chunkIds)
  );
});

const deleteKnowledgeDocument = Effect.fnUntraced(function* (
  documentId: string
) {
  yield* fromPromise("deleteKnowledgeDocument", () =>
    db
      .delete(knowledgeDocumentsTable)
      .where(eq(knowledgeDocumentsTable.id, documentId))
  );
});

const searchKnowledgeChunkTextFallback = Effect.fnUntraced(function* (input: {
  profileId: string;
  query: string;
  keywords: string[];
  limit: number;
}) {
  const patterns = Array.from(
    new Set(
      [input.query.trim(), ...input.keywords].filter(
        (value) => value.length > 0
      )
    )
  );

  if (patterns.length === 0) {
    return [];
  }

  const rows = yield* fromPromise("searchKnowledgeChunkTextFallback", () =>
    db
      .select({
        chunk: knowledgeChunksTable,
        document: knowledgeDocumentsTable,
      })
      .from(knowledgeChunksTable)
      .innerJoin(
        knowledgeDocumentsTable,
        eq(knowledgeChunksTable.documentId, knowledgeDocumentsTable.id)
      )
      .where(
        and(
          or(
            ...patterns.flatMap((pattern) => [
              like(knowledgeChunksTable.content, `%${pattern}%`),
              like(knowledgeChunksTable.keywordsJson, `%${pattern}%`),
            ])
          ),
          or(
            eq(knowledgeDocumentsTable.profileId, input.profileId),
            isNull(knowledgeDocumentsTable.profileId),
            eq(knowledgeDocumentsTable.scope, "global")
          )
        )
      )
      .orderBy(desc(knowledgeChunksTable.updatedAt))
  );

  return rows
    .map((row) => ({
      chunkId: row.chunk.id,
      score: patterns.reduce((score, pattern) => {
        if (row.chunk.content.includes(pattern)) {
          return Math.max(score, 0.6);
        }
        if (row.chunk.keywordsJson.includes(pattern)) {
          return Math.max(score, 0.72);
        }
        return score;
      }, 0),
    }))
    .filter((row) => row.score > 0)
    .slice(0, input.limit);
});

const searchKnowledgeFacts = Effect.fnUntraced(function* (input: {
  profileId: string;
  terms: string[];
  limit: number;
}) {
  const terms = Array.from(
    new Set(input.terms.map((term) => term.trim()).filter(Boolean))
  );

  if (terms.length === 0) {
    return [];
  }

  const rows = yield* fromPromise("searchKnowledgeFacts", () =>
    db
      .select({
        fact: knowledgeFactsTable,
        document: knowledgeDocumentsTable,
      })
      .from(knowledgeFactsTable)
      .innerJoin(
        knowledgeDocumentsTable,
        eq(knowledgeFactsTable.documentId, knowledgeDocumentsTable.id)
      )
      .where(
        and(
          or(
            ...terms.flatMap((term) => [
              like(knowledgeFactsTable.subject, `%${term}%`),
              like(knowledgeFactsTable.predicate, `%${term}%`),
              like(knowledgeFactsTable.object, `%${term}%`),
            ])
          ),
          or(
            eq(knowledgeDocumentsTable.profileId, input.profileId),
            isNull(knowledgeDocumentsTable.profileId),
            eq(knowledgeDocumentsTable.scope, "global")
          )
        )
      )
      .orderBy(desc(knowledgeFactsTable.confidence))
      .limit(input.limit)
  );

  return rows.map((row) => ({
    ...toFact(row.fact),
    document: toDocument(row.document),
  }));
});

export type { KnowledgeDocumentScope, KnowledgeDocumentTrustLevel };
export {
  createKnowledgeChunk,
  createKnowledgeDocument,
  createKnowledgeFacts,
  deleteKnowledgeChunkFtsEntries,
  deleteKnowledgeDocument,
  findKnowledgeDocumentByChecksum,
  getKnowledgeChunksByIds,
  getKnowledgeDocumentDetail,
  listKnowledgeDocumentsVisible,
  listKnowledgeFactsByChunkIds,
  searchKnowledgeChunkText,
  searchKnowledgeChunkTextFallback,
  searchKnowledgeFacts,
  upsertKnowledgeChunkFts,
};
