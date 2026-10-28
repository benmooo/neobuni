import { describe, expect, test } from "vitest";

import { createServerTextAdapter } from "./provider-adapters";

const baseConfig = {
  model: "test-model",
  apiKey: "test-key",
  baseUrl: "https://example.com/v1",
  enabled: true,
} as const;

describe("createServerTextAdapter", () => {
  test("uses TanStack OpenAI adapter for openai provider", () => {
    const adapter = createServerTextAdapter({
      ...baseConfig,
      provider: "openai",
      protocol: "openai",
    });

    expect(adapter.name).toBe("openai");
  });

  test("uses TanStack OpenRouter adapter for openrouter provider", () => {
    const adapter = createServerTextAdapter({
      ...baseConfig,
      provider: "openrouter",
      protocol: "openai",
      baseUrl: "https://openrouter.ai/api/v1",
    });

    expect(adapter.name).toBe("openrouter");
  });

  test("uses TanStack Anthropic adapter for deepseek chat", () => {
    const adapter = createServerTextAdapter({
      ...baseConfig,
      provider: "deepseek",
      protocol: "anthropic",
    });

    expect(adapter.name).toBe("anthropic");
  });

  test("uses TanStack OpenAI adapter for qwen provider", () => {
    const adapter = createServerTextAdapter({
      ...baseConfig,
      provider: "qwen",
      protocol: "openai",
    });

    expect(adapter.name).toBe("openai");
  });

  test("uses TanStack OpenAI chat-completions adapter for opencode", () => {
    const adapter = createServerTextAdapter(
      {
        ...baseConfig,
        provider: "opencode",
        protocol: "openai",
        model: "glm-5.3-flash",
        baseUrl: "",
      },
      { sessionId: "thread-1" }
    );

    expect(adapter.name).toBe("openai-chat");
  });

  test("rejects unsupported vendor and protocol combinations", () => {
    expect(() =>
      createServerTextAdapter({
        ...baseConfig,
        provider: "qwen",
        protocol: "anthropic",
      })
    ).toThrow("Qwen vendor currently supports only the OpenAI protocol.");

    expect(() =>
      createServerTextAdapter({
        ...baseConfig,
        provider: "openrouter",
        protocol: "anthropic",
      })
    ).toThrow("OpenRouter vendor must use the OpenAI protocol.");

    expect(() =>
      createServerTextAdapter({
        ...baseConfig,
        provider: "opencode",
        protocol: "anthropic",
      })
    ).toThrow("OpenCode vendor must use the OpenAI protocol.");
  });
});
