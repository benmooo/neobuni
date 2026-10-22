import type { OpenAICompatibleConfig } from "../providers/openai-compatible-client";

type ServerToolContext = {
	profileId: string;
	conversationId: string | null;
	turnId: string;
	clientTimezone: string | null;
	profileTimezone: string | null;
	defaultTimezone: string;
	referenceNow: string;
	embeddingConfig: OpenAICompatibleConfig | null;
	abortSignal: AbortSignal;
};

export type { ServerToolContext };
