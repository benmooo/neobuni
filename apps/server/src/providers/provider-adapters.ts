import {
  OPENCODE_DEFAULT_BASE_URL,
  type ProviderProtocol,
  type ProviderVendor,
} from "@neobuni/contracts";
import type { AnyTextAdapter } from "@tanstack/ai";
import { createAnthropicChat } from "@tanstack/ai-anthropic";
import {
  createOpenaiChat,
  createOpenaiChatCompletions,
  type OpenAIChatModel,
} from "@tanstack/ai-openai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";

import { createDeepSeekAnthropicAdapter } from "./deepseek-anthropic-adapter";
import { createMockTextAdapter } from "./mock-text-adapter";
import { buildOpenCodeHeaders, OPENCODE_CLIENT_NAME } from "./opencode";

interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  model: string;
  protocol: ProviderProtocol;
  provider: ProviderVendor;
}

const createError = (message: string) => new Error(message);

const ensureConfigured = (config: ProviderConfig) => {
  if (config.apiKey.length === 0) {
    throw createError(
      `${config.provider} provider is selected, but apiKey is empty.`
    );
  }
};

const validateProtocolSelection = (config: ProviderConfig) => {
  if (config.provider === "mock" && config.protocol !== "mock") {
    throw createError("Mock provider must use the mock protocol.");
  }

  if (config.protocol === "mock" && config.provider !== "mock") {
    throw createError("Only the mock provider can use the mock protocol.");
  }

  if (config.provider === "openai" && config.protocol !== "openai") {
    throw createError("OpenAI vendor must use the OpenAI protocol.");
  }

  if (config.provider === "openrouter" && config.protocol !== "openai") {
    throw createError("OpenRouter vendor must use the OpenAI protocol.");
  }

  if (config.provider === "anthropic" && config.protocol !== "anthropic") {
    throw createError("Anthropic vendor must use the Anthropic protocol.");
  }

  if (config.provider === "qwen" && config.protocol !== "openai") {
    throw createError(
      "Qwen vendor currently supports only the OpenAI protocol."
    );
  }

  if (config.provider === "opencode" && config.protocol !== "openai") {
    throw createError("OpenCode vendor must use the OpenAI protocol.");
  }
};

interface TextAdapterOptions {
  /** Stable per-conversation id, forwarded to providers that ask for one. */
  sessionId?: string;
}

const resolveSessionId = (sessionId?: string): string => {
  const trimmed = sessionId?.trim() ?? "";
  return trimmed.length > 0
    ? trimmed
    : `${OPENCODE_CLIENT_NAME}-${crypto.randomUUID()}`;
};

const createOpenAiAdapter = (
  config: ProviderConfig,
  options: Required<TextAdapterOptions>
): AnyTextAdapter => {
  ensureConfigured(config);

  if (config.provider === "openrouter") {
    return createOpenRouterText(
      config.model as never,
      config.apiKey,
      config.baseUrl ? { serverURL: config.baseUrl } : undefined
    ) as unknown as AnyTextAdapter;
  }

  if (config.provider === "opencode") {
    // Chat Completions rather than the Responses API: it is the surface
    // OpenCode documents for every text model, and it matches the raw client
    // the study enrichment/grading paths already use.
    return createOpenaiChatCompletions(config.model as never, config.apiKey, {
      baseURL: config.baseUrl || OPENCODE_DEFAULT_BASE_URL,
      defaultHeaders: buildOpenCodeHeaders({
        sessionId: options.sessionId,
      }),
    }) as unknown as AnyTextAdapter;
  }

  return createOpenaiChat(
    config.model as OpenAIChatModel,
    config.apiKey,
    config.baseUrl ? { baseURL: config.baseUrl } : undefined
  );
};

const createAnthropicAdapter = (
  config: ProviderConfig,
  _options: Required<TextAdapterOptions>
): AnyTextAdapter => {
  ensureConfigured(config);

  if (config.provider === "deepseek") {
    return createDeepSeekAnthropicAdapter({
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    });
  }

  return createAnthropicChat(
    config.model as never,
    config.apiKey,
    config.baseUrl ? { baseURL: config.baseUrl } : undefined
  ) as unknown as AnyTextAdapter;
};

const adapterFactories: Record<
  ProviderProtocol,
  (
    config: ProviderConfig,
    options: Required<TextAdapterOptions>
  ) => AnyTextAdapter
> = {
  mock: () => createMockTextAdapter(),
  openai: createOpenAiAdapter,
  anthropic: createAnthropicAdapter,
};

const createServerTextAdapter = (
  config: ProviderConfig,
  options: TextAdapterOptions = {}
): AnyTextAdapter => {
  if (!config.enabled) {
    return createMockTextAdapter();
  }

  validateProtocolSelection(config);

  const factory = adapterFactories[config.protocol];
  const resolvedOptions: Required<TextAdapterOptions> = {
    sessionId: resolveSessionId(options.sessionId),
  };

  return factory ? factory(config, resolvedOptions) : createMockTextAdapter();
};

export type { TextAdapterOptions };
export { createServerTextAdapter };
