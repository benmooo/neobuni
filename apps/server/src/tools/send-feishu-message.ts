import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));

import {
  sendFeishuMessageDef,
  sendFeishuMessageInputSchema,
} from "@neobuni/contracts";
import { sendFeishuMessage } from "../integrations/feishu";
import type { ServerToolContext } from "./types";

const createSendFeishuMessageTool = (context: ServerToolContext) =>
  sendFeishuMessageDef.server(async (args) => {
    const input = sendFeishuMessageInputSchema.parse(args);
    const result = await sendFeishuMessage(context.profileId, {
      targetAlias: input.targetAlias,
      receiveIdType: input.receiveIdType,
      receiveId: input.receiveId,
      message: input.message,
    });

    await appendEvent(context.profileId, "tool.send_feishu_message", {
      conversationId: context.conversationId,
      turnId: context.turnId,
      targetAlias: result.target.alias,
      receiveIdType: result.target.receiveIdType,
      receiveId: result.target.receiveId,
      messageId: result.messageId,
      messageType: result.messageType,
      preview: result.preview,
    });

    return result;
  });

export { createSendFeishuMessageTool };
