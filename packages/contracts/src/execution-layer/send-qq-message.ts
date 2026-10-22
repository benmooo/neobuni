import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const qqTargetTypeSchema = z.enum(["group_openid", "user_openid"]);

const qqMessagePayloadSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("text"),
		text: z.string().trim().min(1).max(20_000),
	}),
]);

const sendQqMessageInputSchema = z
	.object({
		targetAlias: z.string().trim().min(1).max(120).optional(),
		targetType: qqTargetTypeSchema.optional(),
		targetId: z.string().trim().min(1).max(300).optional(),
		message: qqMessagePayloadSchema,
		eventId: z.string().trim().min(1).max(300).optional(),
		msgId: z.string().trim().min(1).max(300).optional(),
		msgSeq: z.number().int().min(1).max(10_000).optional(),
	})
	.superRefine((value, context) => {
		if (value.targetType && !value.targetId) {
			context.addIssue({
				code: "custom",
				message: "targetId is required when targetType is provided.",
				path: ["targetId"],
			});
		}

		if (value.targetId && !value.targetType) {
			context.addIssue({
				code: "custom",
				message: "targetType is required when targetId is provided.",
				path: ["targetType"],
			});
		}
	});

const sendQqMessageOutputSchema = z.object({
	delivered: z.boolean(),
	messageId: z.string().trim().min(1).nullable(),
	target: z.object({
		alias: z.string().trim().min(1).nullable(),
		targetType: qqTargetTypeSchema,
		targetId: z.string().trim().min(1),
	}),
	deliveryMode: z.enum(["active", "passive"]),
	messageType: z.enum(["text"]),
	preview: z.string().trim().min(1),
});

const sendQqMessageDef = toolDefinition({
	name: "send_qq_message",
	description:
		"Send a text message to a QQ single chat or QQ group through the configured QQ bot integration. Use targetAlias when available, or pass an explicit targetType plus targetId. eventId/msgId/msgSeq can be provided for passive reply delivery.",
	inputSchema: sendQqMessageInputSchema,
	outputSchema: sendQqMessageOutputSchema,
});

export {
	qqMessagePayloadSchema,
	qqTargetTypeSchema,
	sendQqMessageDef,
	sendQqMessageInputSchema,
	sendQqMessageOutputSchema,
};

export type QqMessagePayload = z.infer<typeof qqMessagePayloadSchema>;
export type QqTargetType = z.infer<typeof qqTargetTypeSchema>;
export type SendQqMessageInput = z.infer<typeof sendQqMessageInputSchema>;
export type SendQqMessageOutput = z.infer<typeof sendQqMessageOutputSchema>;
