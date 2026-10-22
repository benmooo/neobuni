import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { feishuReceiveIdTypeSchema } from "./send-feishu-message";

const listFeishuDeliveryLogsInputSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  targetAlias: z.string().trim().min(1).max(120).optional(),
});

const listFeishuDeliveryLogsOutputSchema = z.object({
  count: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      sentAt: z.string().datetime(),
      eventType: z.string().trim().min(1),
      targetAlias: z.string().trim().min(1).nullable(),
      receiveIdType: feishuReceiveIdTypeSchema,
      receiveIdPreview: z.string().trim().min(1),
      messageId: z.string().trim().min(1).nullable(),
      preview: z.string().trim().min(1),
      conversationId: z.string().trim().min(1).nullable(),
      turnId: z.string().trim().min(1).nullable(),
    }),
  ),
});

const listFeishuDeliveryLogsDef = toolDefinition({
  name: "list_feishu_delivery_logs",
  description:
    "List recent Feishu delivery events emitted by Buni tools so delivery history can be inspected from chat.",
  inputSchema: listFeishuDeliveryLogsInputSchema,
  outputSchema: listFeishuDeliveryLogsOutputSchema,
});

export {
  listFeishuDeliveryLogsDef,
  listFeishuDeliveryLogsInputSchema,
  listFeishuDeliveryLogsOutputSchema,
};

export type ListFeishuDeliveryLogsInput = z.infer<
  typeof listFeishuDeliveryLogsInputSchema
>;
export type ListFeishuDeliveryLogsOutput = z.infer<
  typeof listFeishuDeliveryLogsOutputSchema
>;
