import { describe, expect, test } from "vitest";

import type { WebProviderDeps } from "./provider";
import { isDeepSeekHost, resolveWebProvider } from "./provider";

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
  readWebclawConfig: () => ({
    apiKey: "",
    baseUrl: "https://api.webclaw.io",
    timeoutMs: 1000,
  }),
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
        readWebclawConfig: () => ({
          apiKey: "wc_test",
          baseUrl: "https://api.webclaw.io",
          timeoutMs: 1000,
        }),
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
        readWebclawConfig: () => ({
          apiKey: "wc_test",
          baseUrl: "https://api.webclaw.io",
          timeoutMs: 1000,
        }),
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
        readWebclawConfig: () => ({
          apiKey: "wc_test",
          baseUrl: "https://api.webclaw.io",
          timeoutMs: 1000,
        }),
      })
    );

    expect(provider).toBeNull();
  });

  test("prefers the reasoning provider key when it is DeepSeek", async () => {
    const provider = await resolveWebProvider(
      "profile-1",
      searchDeps({
        getMemoryReasoningProviderConfig: async () => reasoningConfig(),
        readWebclawConfig: () => ({
          apiKey: "wc_test",
          baseUrl: "https://api.webclaw.io",
          timeoutMs: 1000,
        }),
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

  test("falls back to Webclaw when the reasoning key is not DeepSeek", async () => {
    const provider = await resolveWebProvider(
      "profile-1",
      searchDeps({
        getMemoryReasoningProviderConfig: async () =>
          reasoningConfig({
            apiKey: "sk_openai",
            baseUrl: "https://api.openai.com/v1",
            provider: "openai",
          }),
        readWebclawConfig: () => ({
          apiKey: "wc_test",
          baseUrl: "https://api.webclaw.io",
          timeoutMs: 1000,
        }),
      })
    );

    expect(provider?.kind).toBe("webclaw");
  });

  test("returns null when nothing is configured", async () => {
    const provider = await resolveWebProvider("profile-1", searchDeps());

    expect(provider).toBeNull();
  });

  test("degrades to the fallback when the provider lookup throws", async () => {
    const provider = await resolveWebProvider(
      "profile-1",
      searchDeps({
        getMemoryReasoningProviderConfig: async () => {
          throw new Error("db down");
        },
        readWebclawConfig: () => ({
          apiKey: "wc_test",
          baseUrl: "https://api.webclaw.io",
          timeoutMs: 1000,
        }),
      })
    );

    expect(provider?.kind).toBe("webclaw");
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
