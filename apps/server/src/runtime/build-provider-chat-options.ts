import {
	normalizePersistedMessages,
	type PersistedMessage,
	type ProviderPromptPacket,
} from "@neobuni/contracts";
import type { ChatMiddleware, Tool } from "@tanstack/ai";

import { createServerTextAdapter } from "../providers/provider-adapters";

const buildProviderChatOptions = (input: {
	providerConfig: Parameters<typeof createServerTextAdapter>[0];
	abortController: AbortController;
	conversationId?: string | null;
	threadId?: string | null;
	promptPacket: ProviderPromptPacket;
	persistedMessages: PersistedMessage[];
	tools: Tool[];
	middleware: ChatMiddleware[];
}) => ({
	adapter: createServerTextAdapter(input.providerConfig),
	abortController: input.abortController,
	...(input.conversationId ? { conversationId: input.conversationId } : {}),
	...(input.threadId ? { threadId: input.threadId } : {}),
	messages: normalizePersistedMessages(input.persistedMessages),
	systemPrompts: [input.promptPacket.systemPrompt],
	tools: input.tools,
	middleware: input.middleware,
});

export { buildProviderChatOptions };
