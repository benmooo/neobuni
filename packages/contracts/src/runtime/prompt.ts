import { z } from "zod";

import { compiledExpressionSetSchema } from "./expression";

const promptSectionKeySchema = z.enum([
	"identity",
	"soul_runtime",
	"text_expression",
	"tool_semantics",
	"goal_context",
	"working_memory",
	"background_memories",
]);

const promptSectionSchema = z.object({
	key: promptSectionKeySchema,
	title: z.string().trim().min(1),
	body: z.string().trim().min(1),
});

const providerPromptPacketSchema = z.object({
	systemPrompt: z.string().trim().min(1),
	sections: z.array(promptSectionSchema).min(1),
	compiledExpression: compiledExpressionSetSchema.nullable(),
});

export {
	promptSectionKeySchema,
	promptSectionSchema,
	providerPromptPacketSchema,
};

export type PromptSection = z.infer<typeof promptSectionSchema>;
export type PromptSectionKey = z.infer<typeof promptSectionKeySchema>;
export type ProviderPromptPacket = z.infer<typeof providerPromptPacketSchema>;
