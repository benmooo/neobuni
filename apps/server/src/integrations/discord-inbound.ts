import {
	recordExternalEventReceipt as recordExternalEventReceiptFx,
	resolveDiscordExternalConversationWindow as resolveDiscordExternalConversationWindowFx,
	runRepo,
} from "@neobuni/db";

const recordExternalEventReceipt = (
	...args: Parameters<typeof recordExternalEventReceiptFx>
) => runRepo(recordExternalEventReceiptFx(...args));
const resolveDiscordExternalConversationWindow = (
	...args: Parameters<typeof resolveDiscordExternalConversationWindowFx>
) => runRepo(resolveDiscordExternalConversationWindowFx(...args));

import { z } from "zod";

import { runExternalMessageTurn } from "../runtime/run-external-message-turn";
import { sendDiscordMessage } from "./discord";
import {
	type DiscordGatewayInboundPrompt,
	discordGatewayInboundPromptSchema,
} from "./discord-gateway-normalize";

const discordInboundRequestSchema = z.object({
	profileId: z.string().trim().min(1),
	inboundPrompt: discordGatewayInboundPromptSchema,
});

type DiscordInboundRequest = z.infer<typeof discordInboundRequestSchema>;

type ExecuteDiscordInboundPromptDeps = {
	resolveDiscordExternalConversationWindow: typeof resolveDiscordExternalConversationWindow;
	runExternalMessageTurn: typeof runExternalMessageTurn;
};

type HandleDiscordInboundMessageDeps = ExecuteDiscordInboundPromptDeps & {
	recordExternalEventReceipt: typeof recordExternalEventReceipt;
	sendDiscordMessage: typeof sendDiscordMessage;
};

const defaultExecuteDiscordInboundPromptDeps: ExecuteDiscordInboundPromptDeps =
	{
		resolveDiscordExternalConversationWindow,
		runExternalMessageTurn,
	};

const defaultHandleDiscordInboundMessageDeps: HandleDiscordInboundMessageDeps =
	{
		...defaultExecuteDiscordInboundPromptDeps,
		recordExternalEventReceipt,
		sendDiscordMessage,
	};

const executeDiscordInboundPrompt = async (
	input: {
		profileId: string;
		scopeKey: string;
		latestUserText: string;
		externalThreadId: string;
	},
	deps: ExecuteDiscordInboundPromptDeps = defaultExecuteDiscordInboundPromptDeps
) => {
	const resolvedWindow = await deps.resolveDiscordExternalConversationWindow({
		profileId: input.profileId,
		scopeKey: input.scopeKey,
	});

	const runtimeResult = await deps.runExternalMessageTurn({
		profileId: input.profileId,
		conversationId: resolvedWindow.conversationId,
		latestUserText: input.latestUserText,
		platform: "discord",
		externalThreadId: input.externalThreadId,
		clientTimezone: null,
	});

	return {
		conversationId: resolvedWindow.conversationId,
		assistantText: runtimeResult.assistantText,
	};
};

const handleDiscordInboundMessage = async (
	input: DiscordInboundRequest,
	deps: HandleDiscordInboundMessageDeps = defaultHandleDiscordInboundMessageDeps
) => {
	const receipt = await deps.recordExternalEventReceipt({
		profileId: input.profileId,
		platform: "discord",
		eventId: input.inboundPrompt.eventId,
	});

	if (!receipt.inserted) {
		return {
			duplicate: true,
			delivered: false,
			assistantText: "",
			messageId: null,
		};
	}

	const runtimeResult = await executeDiscordInboundPrompt(
		{
			profileId: input.profileId,
			scopeKey: input.inboundPrompt.scopeKey,
			latestUserText: input.inboundPrompt.latestUserText,
			externalThreadId: input.inboundPrompt.eventId,
		},
		deps
	);
	const assistantText =
		runtimeResult.assistantText.length > 0
			? runtimeResult.assistantText
			: "I could not produce a reply.";
	const delivery = await deps.sendDiscordMessage(input.profileId, {
		targetId: input.inboundPrompt.targetId,
		message: {
			type: "text",
			text: assistantText,
		},
	});

	return {
		duplicate: false,
		delivered: delivery.delivered,
		assistantText,
		messageId: delivery.messageId,
	};
};

export type { DiscordGatewayInboundPrompt, DiscordInboundRequest };
export {
	discordInboundRequestSchema,
	executeDiscordInboundPrompt,
	handleDiscordInboundMessage,
};
