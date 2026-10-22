import {
  resolveNewsSourceDef,
  resolveNewsSourceInputSchema,
} from "@neobuni/contracts";
import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));

import { resolveNewsSourceQuery } from "../integrations/news/newsnow-catalog";
import type { ServerToolContext } from "./types";

const createResolveNewsSourceTool = (context: ServerToolContext) =>
  resolveNewsSourceDef.server(async (args) => {
    const input = resolveNewsSourceInputSchema.parse(args);
    const result = resolveNewsSourceQuery(input);

    await appendEvent(context.profileId, "tool.resolve_news_source", {
      conversationId: context.conversationId,
      turnId: context.turnId,
      query: result.query,
      status: result.status,
      resolvedSourceId: result.resolvedSourceId,
      count: result.count,
    });

    return result;
  });

export { createResolveNewsSourceTool };
