import { z } from "zod";

const messageRoleSchema = z.enum(["system", "user", "assistant", "tool"]);
const messageKindSchema = z.enum(["text", "generated", "event", "tool_result"]);

const messageCreateSchema = z.object({
	role: messageRoleSchema,
	kind: messageKindSchema.default("text"),
	content: z.string().trim().min(1).max(20_000),
	metadata: z.record(z.string(), z.unknown()).default({}),
});

const messageUpdateSchema = z.object({
	content: z.string().trim().min(1).max(20_000),
	metadata: z.record(z.string(), z.unknown()).default({}),
});

const messageSchema = messageCreateSchema.extend({
	id: z.string(),
	conversationId: z.string(),
	turnId: z.string().nullable().optional(),
	createdAt: z.string().datetime(),
});

export {
	messageCreateSchema,
	messageKindSchema,
	messageRoleSchema,
	messageSchema,
	messageUpdateSchema,
};
