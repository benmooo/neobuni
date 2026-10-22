import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const feishuReceiveIdTypeSchema = z.enum([
  "chat_id",
  "open_id",
  "user_id",
  "union_id",
  "email",
]);

const feishuCardPayloadSchema = z.record(z.string(), z.unknown());

const feishuMessagePayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string().trim().min(1).max(20_000),
  }),
  z.object({
    type: z.literal("card"),
    card: feishuCardPayloadSchema,
    fallbackText: z.string().trim().min(1).max(20_000),
  }),
]);

const sendFeishuMessageInputSchema = z
  .object({
    targetAlias: z.string().trim().min(1).max(120).optional(),
    receiveIdType: feishuReceiveIdTypeSchema.optional(),
    receiveId: z.string().trim().min(1).max(300).optional(),
    message: feishuMessagePayloadSchema,
  })
  .superRefine((value, context) => {
    if (value.targetAlias) {
      return;
    }

    if (!value.receiveIdType) {
      context.addIssue({
        code: "custom",
        message: "receiveIdType is required when targetAlias is not provided.",
        path: ["receiveIdType"],
      });
    }

    if (!value.receiveId) {
      context.addIssue({
        code: "custom",
        message: "receiveId is required when targetAlias is not provided.",
        path: ["receiveId"],
      });
    }
  });

const sendFeishuMessageOutputSchema = z.object({
  delivered: z.boolean(),
  messageId: z.string().trim().min(1).nullable(),
  target: z.object({
    alias: z.string().trim().min(1).nullable(),
    receiveIdType: feishuReceiveIdTypeSchema,
    receiveId: z.string().trim().min(1),
  }),
  messageType: z.enum(["text", "card"]),
  preview: z.string().trim().min(1),
});

const sendFeishuMessageDef = toolDefinition({
  name: "send_feishu_message",
  description:
    "Send a text or interactive card message to a Feishu chat or user through the configured Feishu bot/app integration. Use targetAlias when available, or pass an explicit receiveIdType plus receiveId.",
  inputSchema: sendFeishuMessageInputSchema,
  outputSchema: sendFeishuMessageOutputSchema,
});

export {
  feishuCardPayloadSchema,
  feishuMessagePayloadSchema,
  feishuReceiveIdTypeSchema,
  sendFeishuMessageDef,
  sendFeishuMessageInputSchema,
  sendFeishuMessageOutputSchema,
};

export type FeishuReceiveIdType = z.infer<typeof feishuReceiveIdTypeSchema>;
export type FeishuMessagePayload = z.infer<typeof feishuMessagePayloadSchema>;
export type SendFeishuMessageInput = z.infer<
  typeof sendFeishuMessageInputSchema
>;
export type SendFeishuMessageOutput = z.infer<
  typeof sendFeishuMessageOutputSchema
>;
