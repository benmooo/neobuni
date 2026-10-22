import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));

import { listQqTargetsDef, listQqTargetsInputSchema } from "@neobuni/contracts";
import { listQqTargets } from "../integrations/qq";
import type { ServerToolContext } from "./types";

const createListQqTargetsTool = (context: ServerToolContext) =>
  listQqTargetsDef.server(async (args) => {
    listQqTargetsInputSchema.parse(args);
    const items = await listQqTargets(context.profileId);
    const result = {
      count: items.length,
      items,
    };

    await appendEvent(context.profileId, "tool.list_qq_targets", {
      conversationId: context.conversationId,
      turnId: context.turnId,
      count: result.count,
    });

    return result;
  });

export { createListQqTargetsTool };
