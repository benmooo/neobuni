import { appRouter } from "@neobuni/api/routers/index";
import type { RouterClient } from "@orpc/server";

import { extrasRouter } from "./routers/extras";

export const router = { ...appRouter, ...extrasRouter };

export type ServerRouter = typeof router;
export type ServerRouterClient = RouterClient<ServerRouter>;
