import type { RendererState } from "@neobuni/contracts";

import { createMessage as createMessageFx, runRepo } from "@neobuni/db";

const createMessage = (...args: Parameters<typeof createMessageFx>) =>
	runRepo(createMessageFx(...args));

const persistUserTurnMessage = async (input: {
	conversationId: string;
	turnId: string;
	latestUserText: string;
}) =>
	createMessage(input.conversationId, {
		turnId: input.turnId,
		role: "user",
		kind: "text",
		content: input.latestUserText,
		metadata: {
			source: "server_chat_stream",
		},
	});

const persistAssistantTurnMessage = async (input: {
	conversationId: string;
	turnId: string;
	assistantText: string;
	rendererState: RendererState;
	metadata?: Record<string, unknown>;
}) =>
	createMessage(input.conversationId, {
		turnId: input.turnId,
		role: "assistant",
		kind: "generated",
		content: input.assistantText,
		metadata: {
			source: "server_chat_stream",
			render: input.rendererState,
			...(input.metadata ?? {}),
		},
	});

export { persistAssistantTurnMessage, persistUserTurnMessage };
