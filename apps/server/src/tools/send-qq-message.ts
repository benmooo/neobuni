import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
	runRepo(appendEventFx(...args));

import { sendQqMessageDef, sendQqMessageInputSchema } from "@neobuni/contracts";
import { sendQqMessage } from "../integrations/qq";
import type { ServerToolContext } from "./types";

const createSendQqMessageTool = (context: ServerToolContext) =>
	sendQqMessageDef.server(async (args) => {
		const input = sendQqMessageInputSchema.parse(args);
		const result = await sendQqMessage(context.profileId, input);

		await appendEvent(context.profileId, "tool.send_qq_message", {
			conversationId: context.conversationId,
			turnId: context.turnId,
			targetAlias: result.target.alias,
			targetType: result.target.targetType,
			targetId: result.target.targetId,
			messageId: result.messageId,
			messageType: result.messageType,
			deliveryMode: result.deliveryMode,
			preview: result.preview,
		});

		return result;
	});

export { createSendQqMessageTool };
