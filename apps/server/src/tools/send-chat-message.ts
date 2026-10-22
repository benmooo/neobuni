import {
	appendEvent as appendEventFx,
	createMessage as createMessageFx,
	getConversation as getConversationFx,
	runRepo,
} from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
	runRepo(appendEventFx(...args));
const createMessage = (...args: Parameters<typeof createMessageFx>) =>
	runRepo(createMessageFx(...args));
const getConversation = (...args: Parameters<typeof getConversationFx>) =>
	runRepo(getConversationFx(...args));

import {
	sendChatMessageDef,
	sendChatMessageInputSchema,
} from "@neobuni/contracts";

import type { ServerToolContext } from "./types";

const createSendChatMessageTool = (context: ServerToolContext) =>
	sendChatMessageDef.server(async (args) => {
		const input = sendChatMessageInputSchema.parse(args);
		const conversation = await getConversation(input.conversationId, {
			includeHidden: true,
		});

		if (!conversation || conversation.profileId !== context.profileId) {
			throw new Error("Conversation not found.");
		}

		const message = await createMessage(input.conversationId, {
			turnId: context.turnId,
			role: "assistant",
			kind: "event",
			content: input.message,
			metadata: {
				source: "tool.send_chat_message",
				taskExecution:
					context.conversationId === null ? "headless" : "interactive",
			},
		});

		await appendEvent(context.profileId, "tool.send_chat_message", {
			conversationId: input.conversationId,
			turnId: context.turnId,
			messageId: message.id,
			preview:
				input.message.length <= 200
					? input.message
					: `${input.message.slice(0, 200)}...`,
		});

		return {
			delivered: true,
			messageId: message.id,
			conversationId: input.conversationId,
			preview:
				input.message.length <= 200
					? input.message
					: `${input.message.slice(0, 200)}...`,
		};
	});

export { createSendChatMessageTool };
