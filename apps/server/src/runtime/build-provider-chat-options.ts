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
  threadId: string;
  promptPacket: ProviderPromptPacket;
  persistedMessages: PersistedMessage[];
  tools: Tool[];
  middleware: ChatMiddleware[];
}) => ({
  adapter: createServerTextAdapter(input.providerConfig),
  abortController: input.abortController,
  threadId: input.threadId,
  messages: normalizePersistedMessages(input.persistedMessages),
  systemPrompts: [input.promptPacket.systemPrompt],
  tools: input.tools,
  middleware: input.middleware,
});

export { buildProviderChatOptions };
