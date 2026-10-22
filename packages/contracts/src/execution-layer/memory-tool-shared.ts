import { z } from "zod";

import {
	memorySchema,
	memoryStatusSchema,
	memoryTypeSchema,
} from "../cognition-layer/memory";

const chatMemoryDraftSchema = z.object({
	content: z.string().trim().min(1).max(4000),
	type: memoryTypeSchema,
	keywords: z.array(z.string().trim().min(1)).max(10).optional(),
	importance: z.number().min(0).max(1).optional(),
	unresolved: z.boolean().optional(),
});

const memoryConflictKindSchema = z.enum(["semantic_overlap", "task_overlap"]);
const memoryConflictStatusSchema = z.enum(["open", "resolved", "cancelled"]);
const memoryConflictOperationSchema = z.enum(["save", "update"]);
const memoryConflictResolutionActionSchema = z.enum([
	"keep_existing",
	"replace_existing",
	"create_separate_memory",
	"merge_memories",
	"cancel",
]);

const resolvedChatMemoryDraftSchema = chatMemoryDraftSchema.extend({
	keywords: z.array(z.string().trim().min(1)),
	importance: z.number().min(0).max(1),
	unresolved: z.boolean(),
	status: memoryStatusSchema,
});

const memoryConflictSchema = z.object({
	id: z.string(),
	status: memoryConflictStatusSchema,
	operation: memoryConflictOperationSchema,
	kind: memoryConflictKindSchema,
	reason: z.string(),
	existingMemory: memorySchema,
	subjectMemory: memorySchema.nullable(),
	proposedMemory: resolvedChatMemoryDraftSchema,
	createdAt: z.string().datetime(),
	resolvedAt: z.string().datetime().nullable(),
});

export {
	chatMemoryDraftSchema,
	memoryConflictKindSchema,
	memoryConflictOperationSchema,
	memoryConflictResolutionActionSchema,
	memoryConflictSchema,
	memoryConflictStatusSchema,
	resolvedChatMemoryDraftSchema,
};
