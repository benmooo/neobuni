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
    .route({
      method: "GET",
      path: "/conversations/{conversationId}/messages",
      summary: "List conversation messages",
      description:
        "Return every message in a conversation owned by the current profile, in transcript order.",
      tags: ["Messages"],
    })
    .input(conversationInput)
    .handler(async ({ input, context }) => {
      await requireConversation(context.profileId, input.conversationId);
      return run(listMessages(input.conversationId));
    }),

  create: protectedProcedure
    .route({
      method: "POST",
      path: "/conversations/{conversationId}/messages",
      summary: "Append a message",
      description:
        "Append a message to a conversation and record a creation event with its role.",
      tags: ["Messages"],
    })
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
    .route({
      method: "PATCH",
      path: "/conversations/{conversationId}/messages/{messageId}",
      summary: "Update a message",
      description:
        "Replace a message's content or metadata and record an update event.",
      tags: ["Messages"],
    })
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
    .route({
      method: "DELETE",
      path: "/conversations/{conversationId}/messages/{messageId}",
      summary: "Delete a message",
      description:
        "Delete one message from a conversation and record a deletion event.",
      tags: ["Messages"],
    })
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
