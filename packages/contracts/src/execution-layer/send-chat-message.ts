import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const sendChatMessageInputSchema = z.object({
  conversationId: z.string().trim().min(1),
  message: z.string().trim().min(1).max(20_000),
});

const sendChatMessageOutputSchema = z.object({
  delivered: z.boolean(),
  messageId: z.string().trim().min(1),
  conversationId: z.string().trim().min(1),
  preview: z.string().trim().min(1),
});

const sendChatMessageDef = toolDefinition({
  name: "send_chat_message",
  description:
    "Send a plain chat message into one of the user's existing conversations. Use this for scheduled background tasks that should post a result back into chat.",
  inputSchema: sendChatMessageInputSchema,
  outputSchema: sendChatMessageOutputSchema,
});

export {
  sendChatMessageDef,
  sendChatMessageInputSchema,
  sendChatMessageOutputSchema,
};
