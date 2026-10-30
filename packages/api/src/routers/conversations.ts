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
  list: protectedProcedure
    .route({
      method: "GET",
      path: "/conversations",
      summary: "List conversations",
      description:
        "Return every conversation owned by the current profile with its title and model key.",
      tags: ["Conversations"],
    })
    .handler(({ context }) => run(listConversations(context.profileId))),

  get: protectedProcedure
    .route({
      method: "GET",
      path: "/conversations/{conversationId}",
      summary: "Get a conversation",
      description:
        "Return one conversation owned by the current profile, or 404 when it does not exist.",
      tags: ["Conversations"],
    })
    .input(conversationIdInput)
    .handler(async ({ input, context }) =>
      requireConversation(context.profileId, input.conversationId)
    ),

  create: protectedProcedure
    .route({
      method: "POST",
      path: "/conversations",
      summary: "Create a conversation",
      description:
        "Create an empty conversation for the current profile and record a creation event.",
      tags: ["Conversations"],
    })
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
    .route({
      method: "PATCH",
      path: "/conversations/{conversationId}",
      summary: "Rename a conversation",
      description:
        "Replace the conversation title and record a rename event with the new title.",
      tags: ["Conversations"],
    })
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
    .route({
      method: "DELETE",
      path: "/conversations/{conversationId}",
      summary: "Delete a conversation",
      description:
        "Delete a conversation owned by the current profile and record a deletion event.",
      tags: ["Conversations"],
    })
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
