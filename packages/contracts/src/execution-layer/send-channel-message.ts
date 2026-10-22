import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import {
  channelPlatformSchema,
  channelTargetSchema,
} from "./channel-target";

const channelMessagePayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string().trim().min(1).max(20_000),
  }),
]);

const sendChannelMessageInputSchema = z.object({
  platform: channelPlatformSchema.optional(),
  targetAlias: z.string().trim().min(1).max(120).optional(),
  targetId: z.string().trim().min(1).max(300).optional(),
  message: channelMessagePayloadSchema,
});

const sendChannelMessageOutputSchema = z.object({
  delivered: z.boolean(),
  target: channelTargetSchema,
  messageId: z.string().trim().min(1).nullable(),
  preview: z.string().trim().min(1),
});

const sendChannelMessageDef = toolDefinition({
  name: "send_channel_message",
  description:
    "Send a text message to a configured Discord, Telegram, Feishu, or QQ target through the generic channel delivery layer.",
  inputSchema: sendChannelMessageInputSchema,
  outputSchema: sendChannelMessageOutputSchema,
});

export {
  channelMessagePayloadSchema,
  sendChannelMessageDef,
  sendChannelMessageInputSchema,
  sendChannelMessageOutputSchema,
};

export type ChannelMessagePayload = z.infer<typeof channelMessagePayloadSchema>;
export type SendChannelMessageInput = z.infer<typeof sendChannelMessageInputSchema>;
export type SendChannelMessageOutput = z.infer<typeof sendChannelMessageOutputSchema>;
