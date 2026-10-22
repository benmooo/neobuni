import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { webRenderModeSchema } from "./web-shared";

const savePageToKnowledgeInputSchema = z.object({
  url: z.url(),
  title: z.string().trim().min(1).max(200).optional(),
  trustLevel: z.enum(["imported", "curated"]).default("imported"),
  renderMode: webRenderModeSchema.default("auto"),
});

const savePageToKnowledgeOutputSchema = z.object({
  saved: z.boolean(),
  documentId: z.string().trim().min(1),
  created: z.boolean(),
  chunkCount: z.number().int().nonnegative(),
  factCount: z.number().int().nonnegative(),
  sourceUri: z.url(),
  note: z.string().trim().min(1).optional(),
});

const savePageToKnowledgeDef = toolDefinition({
  name: "save_page_to_knowledge",
  description:
    "Fetch a web page, normalize it, and ingest it into Buni knowledge. Use this when the user explicitly wants to keep a page as reusable world knowledge.",
  inputSchema: savePageToKnowledgeInputSchema,
  outputSchema: savePageToKnowledgeOutputSchema,
});

export {
  savePageToKnowledgeDef,
  savePageToKnowledgeInputSchema,
  savePageToKnowledgeOutputSchema,
};

export type SavePageToKnowledgeInput = z.infer<
  typeof savePageToKnowledgeInputSchema
>;
export type SavePageToKnowledgeOutput = z.infer<
  typeof savePageToKnowledgeOutputSchema
>;
