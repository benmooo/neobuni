import { z } from "zod";

import { idSchema, isoDateTimeSchema } from "../platform/common/base";

const knowledgeDocumentScopeSchema = z.enum(["profile", "global"]);

const knowledgeDocumentTrustLevelSchema = z.enum([
  "imported",
  "curated",
  "system",
]);

const knowledgeDocumentCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  sourceType: z.string().trim().min(1).default("manual"),
  sourceUri: z.string().trim().nullable().optional(),
  scope: knowledgeDocumentScopeSchema.default("profile"),
  trustLevel: knowledgeDocumentTrustLevelSchema.default("imported"),
});

const knowledgeDocumentSummarySchema = z.object({
  id: idSchema,
  profileId: idSchema.nullable(),
  scope: knowledgeDocumentScopeSchema,
  title: z.string(),
  sourceType: z.string(),
  sourceUri: z.string().nullable(),
  trustLevel: knowledgeDocumentTrustLevelSchema,
  status: z.string(),
  checksum: z.string().nullable(),
  chunkCount: z.number().int().nonnegative(),
  factCount: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

const knowledgeChunkSchema = z.object({
  id: idSchema,
  documentId: idSchema,
  chunkIndex: z.number().int().nonnegative(),
  content: z.string(),
  keywords: z.array(z.string()),
  tokenCount: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

const knowledgeFactSchema = z.object({
  id: idSchema,
  documentId: idSchema,
  chunkId: idSchema.nullable(),
  subject: z.string(),
  predicate: z.string(),
  object: z.string(),
  confidence: z.number(),
  createdAt: isoDateTimeSchema,
});

const knowledgeDocumentDetailSchema = knowledgeDocumentSummarySchema.extend({
  chunks: z.array(knowledgeChunkSchema),
  facts: z.array(knowledgeFactSchema),
});

const knowledgeDocumentIngestResultSchema = z.object({
  documentId: idSchema,
  created: z.boolean(),
  chunkCount: z.number().int().nonnegative(),
  factCount: z.number().int().nonnegative(),
});

export {
  knowledgeChunkSchema,
  knowledgeDocumentCreateSchema,
  knowledgeDocumentDetailSchema,
  knowledgeDocumentIngestResultSchema,
  knowledgeDocumentScopeSchema,
  knowledgeDocumentSummarySchema,
  knowledgeDocumentTrustLevelSchema,
  knowledgeFactSchema,
};

export type KnowledgeDocumentCreateInput = z.infer<
  typeof knowledgeDocumentCreateSchema
>;
export type KnowledgeDocumentSummary = z.infer<
  typeof knowledgeDocumentSummarySchema
>;
export type KnowledgeChunk = z.infer<typeof knowledgeChunkSchema>;
export type KnowledgeFact = z.infer<typeof knowledgeFactSchema>;
export type KnowledgeDocumentDetail = z.infer<
  typeof knowledgeDocumentDetailSchema
>;
export type KnowledgeDocumentIngestResult = z.infer<
  typeof knowledgeDocumentIngestResultSchema
>;
