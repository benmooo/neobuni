import { appRouter } from "@neobuni/api/routers/index";
import type { RouterClient } from "@orpc/server";

import { extrasRouter } from "./routers/extras";
import { studyRouter } from "./routers/study";

export const router = { ...appRouter, ...extrasRouter, study: studyRouter };

export type ServerRouter = typeof router;
export type ServerRouterClient = RouterClient<ServerRouter>;
