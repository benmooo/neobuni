import { describe, expect, test } from "vitest";

import type { WebProviderDeps } from "./provider";
import {
  isDeepSeekHost,
  requireWebProvider,
  resolveWebProvider,
  WebProviderNotConfiguredError,
} from "./provider";

const reasoningConfig = (overrides: Record<string, unknown> = {}) =>
  ({
    apiKey: "sk_test",
    baseUrl: "",
    provider: "deepseek",
    ...overrides,
  }) as never;

const webSearchConfig = (overrides: Record<string, unknown> = {}) =>
  ({
    apiKey: "sk_search",
    baseUrl: "https://api.deepseek.com",
    enabled: true,
    provider: "deepseek",
    ...overrides,
  }) as never;

/** Every lookup is stubbed so a test can never hit the real database. */
const searchDeps = (
  overrides: Partial<WebProviderDeps> = {}
): Partial<WebProviderDeps> => ({
  getMemoryReasoningProviderConfig: async () => null,
  getWebSearchProviderConfig: async () => null,
  ...overrides,
});

describe("isDeepSeekHost", () => {
  test("recognizes DeepSeek hosts only", () => {
    expect(isDeepSeekHost("https://api.deepseek.com")).toBe(true);
    expect(isDeepSeekHost("https://api.deepseek.com/v1")).toBe(true);
    expect(isDeepSeekHost("https://opencode.ai/inference/go/openai/v1")).toBe(
      false
    );
    expect(isDeepSeekHost("not a url")).toBe(false);
  });
});

describe("resolveWebProvider", () => {
  test("uses the dedicated web search key before the reasoning key", async () => {
    const provider = await resolveWebProvider(
      "profile-1",
      searchDeps({
        getMemoryReasoningProviderConfig: async () => reasoningConfig(),
        getWebSearchProviderConfig: async () => webSearchConfig(),
      })
    );

    expect(provider).toEqual({
      apiKey: "sk_search",
      baseUrl: "https://api.deepseek.com",
      kind: "deepseek",
    });
  });

  test("respects an explicitly disabled web search slot", async () => {
    const provider = await resolveWebProvider(
      "profile-1",
      searchDeps({
        getMemoryReasoningProviderConfig: async () => reasoningConfig(),
        getWebSearchProviderConfig: async () =>
          webSearchConfig({ enabled: false }),
      })
    );

    expect(provider).toBeNull();
  });

  test("does not fall back when the web search slot has no key", async () => {
    const provider = await resolveWebProvider(
      "profile-1",
      searchDeps({
        getMemoryReasoningProviderConfig: async () => reasoningConfig(),
        getWebSearchProviderConfig: async () =>
          webSearchConfig({ apiKey: " " }),
      })
    );

    expect(provider).toBeNull();
  });

  test("prefers the reasoning provider key when it is DeepSeek", async () => {
    const provider = await resolveWebProvider(
      "profile-1",
      searchDeps({
        getMemoryReasoningProviderConfig: async () => reasoningConfig(),
      })
    );

    expect(provider).toEqual({
      apiKey: "sk_test",
      baseUrl: "https://api.deepseek.com",
      kind: "deepseek",
    });
  });

  test("accepts a DeepSeek-compatible base url on any provider label", async () => {
    const provider = await resolveWebProvider(
      "profile-1",
      searchDeps({
        getMemoryReasoningProviderConfig: async () =>
          reasoningConfig({
            baseUrl: "https://api.deepseek.com/v1/",
            provider: "openai-compatible",
          }),
      })
    );

    expect(provider?.kind).toBe("deepseek");
    expect(provider?.baseUrl).toBe("https://api.deepseek.com/v1/");
  });

  test("returns null when the reasoning key is not DeepSeek", async () => {
    const provider = await resolveWebProvider(
      "profile-1",
      searchDeps({
        getMemoryReasoningProviderConfig: async () =>
          reasoningConfig({
            apiKey: "sk_openai",
            baseUrl: "https://api.openai.com/v1",
            provider: "openai",
          }),
      })
    );

    expect(provider).toBeNull();
  });

  test("returns null when nothing is configured", async () => {
    const provider = await resolveWebProvider("profile-1", searchDeps());

    expect(provider).toBeNull();
  });

  test("degrades to null when the reasoning lookup throws", async () => {
    const provider = await resolveWebProvider(
      "profile-1",
      searchDeps({
        getMemoryReasoningProviderConfig: async () => {
          throw new Error("db down");
        },
        getWebSearchProviderConfig: async () => {
          throw new Error("db down");
        },
      })
    );

    expect(provider).toBeNull();
  });

  test("degrades when the dedicated lookup throws", async () => {
    const provider = await resolveWebProvider(
      "profile-1",
      searchDeps({
        getWebSearchProviderConfig: async () => {
          throw new Error("db down");
        },
        getMemoryReasoningProviderConfig: async () => reasoningConfig(),
      })
    );

    expect(provider?.kind).toBe("deepseek");
    expect(provider?.apiKey).toBe("sk_test");
  });
});

describe("requireWebProvider", () => {
  test("throws an actionable error when no provider is configured", async () => {
    await expect(
      requireWebProvider("profile-1", async () => null)
    ).rejects.toBeInstanceOf(WebProviderNotConfiguredError);
  });

  test("returns the resolved provider", async () => {
    const provider = {
      apiKey: "sk_search",
      baseUrl: "https://api.deepseek.com",
      kind: "deepseek" as const,
    };

    await expect(
      requireWebProvider("profile-1", async () => provider)
    ).resolves.toEqual(provider);
  });
});
