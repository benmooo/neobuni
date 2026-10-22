import type { ProviderProtocol, ProviderVendor } from "@neobuni/contracts";
import type { AnyTextAdapter } from "@tanstack/ai";
import { createAnthropicChat } from "@tanstack/ai-anthropic";
import { createOpenaiChat, type OpenAIChatModel } from "@tanstack/ai-openai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";

import { createDeepSeekAnthropicAdapter } from "./deepseek-anthropic-adapter";
import { createMockTextAdapter } from "./mock-text-adapter";

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
};

const createOpenAiAdapter = (config: ProviderConfig): AnyTextAdapter => {
  ensureConfigured(config);

  if (config.provider === "openrouter") {
    return createOpenRouterText(
      config.model as never,
      config.apiKey,
      config.baseUrl ? { serverURL: config.baseUrl } : undefined
    ) as unknown as AnyTextAdapter;
  }

  return createOpenaiChat(
    config.model as OpenAIChatModel,
    config.apiKey,
    config.baseUrl ? { baseURL: config.baseUrl } : undefined
  );
};

const createAnthropicAdapter = (config: ProviderConfig): AnyTextAdapter => {
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
  (config: ProviderConfig) => AnyTextAdapter
> = {
  mock: () => createMockTextAdapter(),
  openai: createOpenAiAdapter,
  anthropic: createAnthropicAdapter,
};

const createServerTextAdapter = (config: ProviderConfig): AnyTextAdapter => {
  if (!config.enabled) {
    return createMockTextAdapter();
  }

  validateProtocolSelection(config);

  const factory = adapterFactories[config.protocol];
  return factory ? factory(config) : createMockTextAdapter();
};

export { createServerTextAdapter };
