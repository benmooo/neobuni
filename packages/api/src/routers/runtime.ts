import {
  runtimeRecentActivityQuerySchema,
  runtimeTurnListQuerySchema,
  runtimeTurnParamSchema,
} from "@neobuni/contracts";
import {
  getConversation,
  getRuntimeTurn,
  listRecentRuntimeSpans,
  listRecentRuntimeTurns,
  listRuntimeSpansByTurn,
  listRuntimeTurnsByConversation,
} from "@neobuni/db";
import { ORPCError } from "@orpc/server";

import { protectedProcedure } from "../index";
import { run } from "../run";

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

const requireRuntimeTurn = async (profileId: string, turnId: string) => {
  const turn = await run(getRuntimeTurn(turnId));

  if (!turn || turn.profileId !== profileId) {
    throw new ORPCError("NOT_FOUND", { message: "Runtime turn not found" });
  }

  return turn;
};

export const runtimeRouter = {
  recentActivity: protectedProcedure
    .route({
      method: "GET",
      path: "/runtime/recent-activity",
      summary: "List recent runtime activity",
      description:
        "Return running turns, recently failed or aborted turns, and recent failed spans for the current profile.",
      tags: ["Runtime"],
    })
    .input(runtimeRecentActivityQuerySchema)
    .handler(async ({ input, context }) => {
      const { profileId } = context;
      const { limit } = input;

      const [runningTurns, recentProblemTurns, recentFailedSpans] =
        await Promise.all([
          run(
            listRecentRuntimeTurns(profileId, { statuses: ["running"], limit })
          ),
          run(
            listRecentRuntimeTurns(profileId, {
              statuses: ["failed", "aborted"],
              limit,
            })
          ),
          run(
            listRecentRuntimeSpans({
              profileId,
              statuses: ["failed"],
              limit,
            })
          ),
        ]);

      return { runningTurns, recentProblemTurns, recentFailedSpans };
    }),

  listTurns: protectedProcedure
    .route({
      method: "GET",
      path: "/conversations/{conversationId}/turns",
      summary: "List conversation turns",
      description:
        "Return the runtime turns recorded for one conversation owned by the current profile.",
      tags: ["Runtime"],
    })
    .input(runtimeTurnListQuerySchema)
    .handler(async ({ input, context }) => {
      await requireConversation(context.profileId, input.conversationId);

      return run(
        listRuntimeTurnsByConversation(context.profileId, input.conversationId)
      );
    }),

  getTurn: protectedProcedure
    .route({
      method: "GET",
      path: "/runtime/turns/{turnId}",
      summary: "Get a runtime turn",
      description:
        "Return one runtime turn owned by the current profile, or 404 when it does not exist.",
      tags: ["Runtime"],
    })
    .input(runtimeTurnParamSchema)
    .handler(({ input, context }) =>
      requireRuntimeTurn(context.profileId, input.turnId)
    ),

  listTurnSpans: protectedProcedure
    .route({
      method: "GET",
      path: "/runtime/turns/{turnId}/spans",
      summary: "List runtime turn spans",
      description:
        "Return the ordered spans (model calls, tool calls, retrievals) recorded for one runtime turn.",
      tags: ["Runtime"],
    })
    .input(runtimeTurnParamSchema)
    .handler(async ({ input, context }) => {
      await requireRuntimeTurn(context.profileId, input.turnId);

      return run(listRuntimeSpansByTurn(input.turnId));
    }),
};
