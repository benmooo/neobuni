import {
  getNewsHeadlinesDef,
  getNewsHeadlinesInputSchema,
} from "@neobuni/contracts";
import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));

import { fetchNewsNowSource } from "../integrations/news/newsnow";
import type { ServerToolContext } from "./types";

const createGetNewsHeadlinesTool = (context: ServerToolContext) =>
  getNewsHeadlinesDef.server(async (args) => {
    const input = getNewsHeadlinesInputSchema.parse(args);
    const result = await fetchNewsNowSource({
      sourceId: input.sourceId,
      count: input.count,
      signal: context.abortSignal,
    });

    await appendEvent(context.profileId, "tool.get_news_headlines", {
      conversationId: context.conversationId,
      turnId: context.turnId,
      sourceId: result.sourceId,
      count: result.items.length,
    });

    return {
      provider: result.provider,
      sourceId: result.sourceId,
      sourceName: result.sourceName,
      updatedTime: result.updatedTime,
      count: result.items.length,
      items: result.items,
    };
  });

export { createGetNewsHeadlinesTool };
