import { messageCreateSchema, messageUpdateSchema } from "@neobuni/contracts";
import {
  appendEvent,
  createMessage,
  deleteMessage,
  getConversation,
  listMessages,
  updateMessage,
} from "@neobuni/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { run } from "../run";

const conversationInput = z.object({ conversationId: z.string().min(1) });
const messageInput = conversationInput.extend({
  messageId: z.string().min(1),
});

const requireConversation = async (
  profileId: string,
  conversationId: string
) => {
  const conversation = await run(getConversation(conversationId));

  if (!conversation || conversation.profileId !== profileId) {
    throw new ORPCError("NOT_FOUND", { message: "Conversation not found" });
  }

  return conversation;
};

export const messagesRouter = {
  list: protectedProcedure
    .input(conversationInput)
    .handler(async ({ input, context }) => {
      await requireConversation(context.profileId, input.conversationId);
      return run(listMessages(input.conversationId));
    }),

  create: protectedProcedure
    .input(conversationInput.merge(messageCreateSchema))
    .handler(async ({ input, context }) => {
      const { conversationId, ...payload } = input;
      await requireConversation(context.profileId, conversationId);

      const message = await run(createMessage(conversationId, payload));
      await run(
        appendEvent(context.profileId, "message.created", {
          conversationId,
          messageId: message.id,
          role: message.role,
        })
      );

      return message;
    }),

  update: protectedProcedure
    .input(messageInput.merge(messageUpdateSchema))
    .handler(async ({ input, context }) => {
      const { conversationId, messageId, ...payload } = input;
      await requireConversation(context.profileId, conversationId);

      const message = await run(
        updateMessage(conversationId, messageId, payload)
      );
      await run(
        appendEvent(context.profileId, "message.updated", {
          conversationId,
          messageId,
        })
      );

      return message;
    }),

  remove: protectedProcedure
    .input(messageInput)
    .handler(async ({ input, context }) => {
      await requireConversation(context.profileId, input.conversationId);
      const result = await run(
        deleteMessage(input.conversationId, input.messageId)
      );
      await run(
        appendEvent(context.profileId, "message.deleted", {
          conversationId: input.conversationId,
          messageId: input.messageId,
        })
      );

      return result;
    }),
};
