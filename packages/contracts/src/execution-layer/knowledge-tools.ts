import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const knowledgeCitationSchema = z.object({
  chapter: z.string().trim().min(1).max(200).nullable(),
  locator: z.string().trim().min(1).max(300).nullable(),
  page: z.number().int().positive().nullable(),
  pageEnd: z.number().int().positive().nullable(),
});

const searchKnowledgeInputSchema = z.object({
  query: z.string().trim().min(1).max(300),
  limit: z.number().int().min(1).max(10).default(5),
  documentTitle: z.string().trim().min(1).max(200).optional(),
});

const searchKnowledgeOutputSchema = z.object({
  query: z.string().trim().min(1),
  count: z.number().int().nonnegative(),
  items: z.array(
    knowledgeCitationSchema.extend({
      chunkId: z.string().trim().min(1),
      chunkIndex: z.number().int().nonnegative(),
      documentId: z.string().trim().min(1),
      documentTitle: z.string().trim().min(1),
      score: z.number(),
      text: z.string().trim().min(1).max(4000),
    })
  ),
});

const searchKnowledgeDef = toolDefinition({
  name: "search_knowledge",
  description:
    "Search the user's ingested textbooks, notes and saved pages. Use this before saying you cannot access files, and before guessing a chapter or page number. Cite results with the returned locator (for example 第2章 p.34-35).",
  inputSchema: searchKnowledgeInputSchema,
  outputSchema: searchKnowledgeOutputSchema,
});

const listKnowledgeInputSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
});

const listKnowledgeOutputSchema = z.object({
  count: z.number().int().nonnegative(),
  documents: z.array(
    z.object({
      id: z.string().trim().min(1),
      title: z.string().trim().min(1),
      sourceType: z.string().trim().min(1),
      trustLevel: z.string().trim().min(1),
      chunkCount: z.number().int().nonnegative(),
      updatedAt: z.string().trim().min(1),
    })
  ),
});

const listKnowledgeDef = toolDefinition({
  name: "list_knowledge",
  description:
    "List the documents in the user's knowledge base (textbooks, notes, saved pages) with their chunk counts. Use this when the user asks what material you can read.",
  inputSchema: listKnowledgeInputSchema,
  outputSchema: listKnowledgeOutputSchema,
});

export {
  knowledgeCitationSchema,
  listKnowledgeDef,
  listKnowledgeInputSchema,
  listKnowledgeOutputSchema,
  searchKnowledgeDef,
  searchKnowledgeInputSchema,
  searchKnowledgeOutputSchema,
};

export type ListKnowledgeInput = z.infer<typeof listKnowledgeInputSchema>;
export type ListKnowledgeOutput = z.infer<typeof listKnowledgeOutputSchema>;
export type SearchKnowledgeInput = z.infer<typeof searchKnowledgeInputSchema>;
export type SearchKnowledgeOutput = z.infer<typeof searchKnowledgeOutputSchema>;
