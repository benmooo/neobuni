import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));

import {
  listChannelTargetsDef,
  listChannelTargetsInputSchema,
} from "@neobuni/contracts";
import { listChannelTargets } from "../integrations/messaging";
import type { ServerToolContext } from "./types";

interface ListChannelTargetsDeps {
  appendEvent: typeof appendEvent;
  listChannelTargets: typeof listChannelTargets;
}

const defaultDeps: ListChannelTargetsDeps = {
  appendEvent,
  listChannelTargets,
};

const createListChannelTargetsTool = (
  context: ServerToolContext,
  deps: ListChannelTargetsDeps = defaultDeps
) =>
  listChannelTargetsDef.server(async (args) => {
    const input = listChannelTargetsInputSchema.parse(args);
    const result = await deps.listChannelTargets(
      context.profileId,
      input.platform
    );

    await deps.appendEvent(context.profileId, "tool.list_channel_targets", {
      conversationId: context.conversationId,
      turnId: context.turnId,
      platform: input.platform ?? null,
      count: result.count,
    });

    return result;
  });

export { createListChannelTargetsTool };
