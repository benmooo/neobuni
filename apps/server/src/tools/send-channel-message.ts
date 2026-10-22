import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));

import {
  sendChannelMessageDef,
  sendChannelMessageInputSchema,
} from "@neobuni/contracts";
import { sendChannelMessage } from "../integrations/messaging";
import type { ServerToolContext } from "./types";

interface SendChannelMessageDeps {
  appendEvent: typeof appendEvent;
  sendChannelMessage: typeof sendChannelMessage;
}

const defaultDeps: SendChannelMessageDeps = {
  appendEvent,
  sendChannelMessage,
};

const createSendChannelMessageTool = (
  context: ServerToolContext,
  deps: SendChannelMessageDeps = defaultDeps
) =>
  sendChannelMessageDef.server(async (args) => {
    const input = sendChannelMessageInputSchema.parse(args);
    const result = await deps.sendChannelMessage(context.profileId, input);

    await deps.appendEvent(context.profileId, "tool.send_channel_message", {
      conversationId: context.conversationId,
      turnId: context.turnId,
      platform: result.target.platform,
      targetAlias: result.target.targetAlias,
      targetId: result.target.targetId,
      messageId: result.messageId,
      preview: result.preview,
    });

    return result;
  });

export { createSendChannelMessageTool };
