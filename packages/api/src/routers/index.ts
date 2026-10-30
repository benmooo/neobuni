import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import { configRouter } from "./config";
import { conversationsRouter } from "./conversations";
import { goalsRouter } from "./goals";
import { integrationsRouter } from "./integrations";
import { knowledgeRouter } from "./knowledge";
import { memoriesRouter } from "./memories";
import { messagesRouter } from "./messages";
import { profileRouter } from "./profile";
import { runtimeRouter } from "./runtime";
import { schedulesRouter } from "./schedules";
import { taskRunsRouter } from "./task-runs";

export const appRouter = {
  healthCheck: publicProcedure
    .route({
      method: "GET",
      path: "/health",
      summary: "Health check",
      description:
        "Return OK when the oRPC router is reachable. Public: no session required.",
      tags: ["Health"],
    })
    .handler(() => "OK"),
  conversations: conversationsRouter,
  messages: messagesRouter,
  profile: profileRouter,
  memories: memoriesRouter,
  knowledge: knowledgeRouter,
  schedules: schedulesRouter,
  taskRuns: taskRunsRouter,
  goals: goalsRouter,
  config: configRouter,
  runtime: runtimeRouter,
  integrations: integrationsRouter,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
