import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { memorySchema } from "../cognition-layer/memory";
import {
	chatMemoryDraftSchema,
	memoryConflictSchema,
} from "./memory-tool-shared";

const saveMemoryInputSchema = chatMemoryDraftSchema;

const saveMemoryDef = toolDefinition({
	name: "save_memory",
	description:
		"Save a durable personal memory for the user. Use this only for stable facts, preferences, commitments, or notable events worth recalling later.",
	inputSchema: saveMemoryInputSchema,
	outputSchema: z.object({
		saved: z.boolean(),
		memory: memorySchema.nullable(),
		duplicateOfMemoryId: z.string().optional(),
		conflict: memoryConflictSchema.nullable().optional(),
		note: z.string().optional(),
	}),
});

export { saveMemoryDef, saveMemoryInputSchema };
