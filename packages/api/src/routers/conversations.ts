import {
  conversationCreateSchema,
  conversationUpdateSchema,
} from "@neobuni/contracts";
import {
  appendEvent,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  updateConversationTitle,
} from "@neobuni/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { run } from "../run";

const conversationIdInput = z.object({ conversationId: z.string().min(1) });

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

export const conversationsRouter = {
  list: protectedProcedure.handler(({ context }) =>
    run(listConversations(context.profileId))
  ),

  get: protectedProcedure
    .input(conversationIdInput)
    .handler(async ({ input, context }) =>
      requireConversation(context.profileId, input.conversationId)
    ),

  create: protectedProcedure
    .input(conversationCreateSchema)
    .handler(async ({ input, context }) => {
      const conversation = await run(
        createConversation(context.profileId, input)
      );

      await run(
        appendEvent(context.profileId, "conversation.created", {
          conversationId: conversation.id,
          title: conversation.title,
        })
      );

      return conversation;
    }),

  rename: protectedProcedure
    .input(conversationIdInput.merge(conversationUpdateSchema))
    .handler(async ({ input, context }) => {
      const existing = await requireConversation(
        context.profileId,
        input.conversationId
      );

      await run(updateConversationTitle(input.conversationId, input.title));
      await run(
        appendEvent(context.profileId, "conversation.renamed", {
          conversationId: input.conversationId,
          title: input.title,
        })
      );

      return { ...existing, title: input.title };
    }),

  remove: protectedProcedure
    .input(conversationIdInput)
    .handler(async ({ input, context }) => {
      await requireConversation(context.profileId, input.conversationId);
      await run(deleteConversation(input.conversationId));
      await run(
        appendEvent(context.profileId, "conversation.deleted", {
          conversationId: input.conversationId,
        })
      );

      return { id: input.conversationId };
    }),
};
