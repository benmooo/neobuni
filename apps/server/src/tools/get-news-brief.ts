import { getNewsBriefDef, getNewsBriefInputSchema } from "@neobuni/contracts";
import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));

import { getNewsBrief } from "../integrations/news/news-briefs";
import type { ServerToolContext } from "./types";

const createGetNewsBriefTool = (context: ServerToolContext) =>
  getNewsBriefDef.server(async (args) => {
    const input = getNewsBriefInputSchema.parse(args);
    const result = await getNewsBrief({
      briefId: input.briefId,
      countPerSource: input.countPerSource,
      maxItems: input.maxItems,
      signal: context.abortSignal,
    });

    await appendEvent(context.profileId, "tool.get_news_brief", {
      conversationId: context.conversationId,
      turnId: context.turnId,
      briefId: result.briefId,
      count: result.count,
      sourceCount: result.sourceCount,
      noteCount: result.notes.length,
    });

    return result;
  });

export { createGetNewsBriefTool };
