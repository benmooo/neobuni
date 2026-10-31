import { describe, expect, test } from "vitest";

import { isDeepSeekHost, resolveWebProvider } from "./provider";

const reasoningConfig = (overrides: Record<string, unknown> = {}) =>
  ({
    apiKey: "sk_test",
    baseUrl: "",
    provider: "deepseek",
    ...overrides,
  }) as never;

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
  test("prefers the reasoning provider key when it is DeepSeek", async () => {
    const provider = await resolveWebProvider("profile-1", {
      getMemoryReasoningProviderConfig: async () => reasoningConfig(),
      readWebclawConfig: () => ({
        apiKey: "wc_test",
        baseUrl: "https://api.webclaw.io",
        timeoutMs: 1000,
      }),
    });

    expect(provider).toEqual({
      apiKey: "sk_test",
      baseUrl: "https://api.deepseek.com",
      kind: "deepseek",
    });
  });

  test("accepts a DeepSeek-compatible base url on any provider label", async () => {
    const provider = await resolveWebProvider("profile-1", {
      getMemoryReasoningProviderConfig: async () =>
        reasoningConfig({
          baseUrl: "https://api.deepseek.com/v1/",
          provider: "openai-compatible",
        }),
      readWebclawConfig: () => ({
        apiKey: "",
        baseUrl: "https://api.webclaw.io",
        timeoutMs: 1000,
      }),
    });

    expect(provider?.kind).toBe("deepseek");
    expect(provider?.baseUrl).toBe("https://api.deepseek.com/v1/");
  });

  test("falls back to Webclaw when the reasoning key is not DeepSeek", async () => {
    const provider = await resolveWebProvider("profile-1", {
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
    });

    expect(provider?.kind).toBe("webclaw");
  });

  test("returns null when nothing is configured", async () => {
    const provider = await resolveWebProvider("profile-1", {
      getMemoryReasoningProviderConfig: async () => null,
      readWebclawConfig: () => ({
        apiKey: "",
        baseUrl: "https://api.webclaw.io",
        timeoutMs: 1000,
      }),
    });

    expect(provider).toBeNull();
  });

  test("degrades to the fallback when the provider lookup throws", async () => {
    const provider = await resolveWebProvider("profile-1", {
      getMemoryReasoningProviderConfig: async () => {
        throw new Error("db down");
      },
      readWebclawConfig: () => ({
        apiKey: "wc_test",
        baseUrl: "https://api.webclaw.io",
        timeoutMs: 1000,
      }),
    });

    expect(provider?.kind).toBe("webclaw");
  });
});
