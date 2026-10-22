import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const recallMemoryInputSchema = z.object({
  query: z.string().trim().min(1),
  keywords: z.array(z.string().trim().min(1)).max(8).optional(),
  limit: z.number().int().min(1).max(8).optional(),
});

const recallMemoryDef = toolDefinition({
  name: "recall_memory",
  description: "Search the user's long-term memory for relevant personal context when needed.",
  inputSchema: recallMemoryInputSchema,
  outputSchema: z.object({
    recalled: z.boolean(),
    query: z.string(),
    keywords: z.array(z.string()),
    memories: z.array(
      z.object({
        id: z.string(),
        content: z.string(),
        type: z.string(),
        keywords: z.array(z.string()),
        importance: z.number(),
        similarity: z.number(),
      }),
    ),
    error: z.string().optional(),
  }),
});

export { recallMemoryDef, recallMemoryInputSchema };
