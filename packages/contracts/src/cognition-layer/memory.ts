import { z } from "zod";

const memoryTypeSchema = z.enum([
  "event",
  "thought",
  "preference",
  "fact",
  "task",
]);
const memoryClassSchema = z.enum(["episodic", "semantic", "task"]);
const memoryStatusSchema = z.enum(["active", "done", "superseded", "archived"]);
const memorySourceKindSchema = z.enum([
  "digest",
  "manual",
  "chat_tool",
  "conflict_resolution",
  "imported",
  "learned",
]);

const memoryCreateSchema = z.object({
  content: z.string().trim().min(1).max(8000),
  type: memoryTypeSchema,
  keywords: z.array(z.string().trim().min(1)).max(10).default([]),
  importance: z.number().min(0).max(1).default(0.5),
  sourceStartTs: z.string().datetime().nullable().default(null),
  sourceEndTs: z.string().datetime().nullable().default(null),
  unresolved: z.boolean().default(false),
  conversationId: z.string().trim().min(1).nullable().default(null),
  episodeId: z.string().trim().min(1).nullable().default(null),
  memoryClass: memoryClassSchema.optional(),
  status: memoryStatusSchema.default("active"),
  sourceKind: memorySourceKindSchema.default("manual"),
});

const memoryUpdateSchema = memoryCreateSchema.partial();

const memorySchema = memoryCreateSchema.extend({
  id: z.string(),
  profileId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const memorySearchSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  keywords: z.array(z.string().trim().min(1)).max(10).default([]),
  limit: z.number().int().min(1).max(20).default(5),
});

const memoryDigestSchema = z.object({
  conversationId: z.string().trim().min(1),
});

export {
  memoryClassSchema,
  memoryCreateSchema,
  memoryDigestSchema,
  memorySchema,
  memorySearchSchema,
  memorySourceKindSchema,
  memoryStatusSchema,
  memoryTypeSchema,
  memoryUpdateSchema,
};

export type MemoryType = z.infer<typeof memoryTypeSchema>;
export type MemoryClass = z.infer<typeof memoryClassSchema>;
export type MemoryStatus = z.infer<typeof memoryStatusSchema>;
export type MemorySourceKind = z.infer<typeof memorySourceKindSchema>;
export type Memory = z.infer<typeof memorySchema>;
