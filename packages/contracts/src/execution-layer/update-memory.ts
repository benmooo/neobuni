import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { memorySchema, memoryStatusSchema } from "../cognition-layer/memory";
import {
	chatMemoryDraftSchema,
	memoryConflictSchema,
} from "./memory-tool-shared";

const updateMemoryInputSchema = chatMemoryDraftSchema
	.partial()
	.extend({
		memoryId: z.string().trim().min(1),
		status: memoryStatusSchema.optional(),
	})
	.refine(
		(value) =>
			value.content !== undefined ||
			value.type !== undefined ||
			value.keywords !== undefined ||
			value.importance !== undefined ||
			value.unresolved !== undefined ||
			value.status !== undefined,
		{
			message: "update_memory requires at least one field to change.",
		}
	);

const updateMemoryDef = toolDefinition({
	name: "update_memory",
	description:
		"Update an existing durable memory when the user corrects, clarifies, or changes previously stored context.",
	inputSchema: updateMemoryInputSchema,
	outputSchema: z.object({
		updated: z.boolean(),
		memory: memorySchema.nullable(),
		conflict: memoryConflictSchema.nullable().optional(),
		note: z.string().optional(),
	}),
});

export { updateMemoryDef, updateMemoryInputSchema };
