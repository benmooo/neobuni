import type { OpenAICompatibleConfig } from "../providers/openai-compatible-client";

interface ServerToolContext {
  abortSignal: AbortSignal;
  clientTimezone: string | null;
  conversationId: string | null;
  defaultTimezone: string;
  embeddingConfig: OpenAICompatibleConfig | null;
  profileId: string;
  profileTimezone: string | null;
  referenceNow: string;
  turnId: string;
}

export type { ServerToolContext };
