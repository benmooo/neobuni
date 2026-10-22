import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import {
  memoryConflictResolutionActionSchema,
  memoryConflictSchema,
} from "./memory-tool-shared";
import { memorySchema } from "../cognition-layer/memory";

const resolveMemoryConflictInputSchema = z.object({
  conflictId: z.string().trim().min(1),
  action: memoryConflictResolutionActionSchema,
  content: z.string().trim().min(1).max(4000).optional(),
  keywords: z.array(z.string().trim().min(1)).max(10).optional(),
  importance: z.number().min(0).max(1).optional(),
  unresolved: z.boolean().optional(),
});

const resolveMemoryConflictDef = toolDefinition({
  name: "resolve_memory_conflict",
  description:
    "Resolve a previously detected memory conflict after the user clarifies whether to keep, replace, merge, or split the memories.",
  inputSchema: resolveMemoryConflictInputSchema,
  outputSchema: z.object({
    resolved: z.boolean(),
    action: memoryConflictResolutionActionSchema,
    conflict: memoryConflictSchema,
    memory: memorySchema.nullable(),
    archivedMemoryIds: z.array(z.string()),
    note: z.string().optional(),
  }),
});

export {
  resolveMemoryConflictDef,
  resolveMemoryConflictInputSchema,
};
