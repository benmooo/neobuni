import { describe, expect, test } from "vitest";

import {
  OPENCODE_CONSOLE_BASE_URL,
  OPENCODE_DEFAULT_BASE_URL,
  providerConfigInputSchema,
  providerModelListInputSchema,
  webSearchProviderConfigInputSchema,
} from "./provider";

const baseInput = {
  provider: "opencode",
  protocol: "openai",
  model: "glm-5.3-flash",
  apiKey: "sk-test",
  baseUrl: "",
  enabled: true,
};

describe("provider config contracts", () => {
  test("accepts opencode on the OpenAI protocol", () => {
    const parsed = providerConfigInputSchema.parse(baseInput);

    expect(parsed.provider).toBe("opencode");
    expect(parsed.protocol).toBe("openai");
  });

  test("leaves the protocol to the persistence layer when omitted", () => {
    const parsed = providerConfigInputSchema.parse({
      ...baseInput,
      protocol: undefined,
    });

    // `deriveProtocol` in @neobuni/db fills this in as "openai".
    expect(parsed.protocol).toBeUndefined();
  });

  test("rejects opencode on the Anthropic protocol", () => {
    const result = providerConfigInputSchema.safeParse({
      ...baseInput,
      protocol: "anthropic",
    });

    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some(
        (issue) =>
          issue.message === "OpenCode vendor must use the OpenAI protocol."
      )
    ).toBe(true);
  });

  test("requires an API key for opencode", () => {
    const result = providerConfigInputSchema.safeParse({
      ...baseInput,
      apiKey: "",
    });

    expect(result.success).toBe(false);
  });

  test("pins the OpenCode Go base URL and keeps Console distinct", () => {
    expect(OPENCODE_DEFAULT_BASE_URL).toBe(
      "https://opencode.ai/inference/go/openai/v1"
    );
    expect(OPENCODE_CONSOLE_BASE_URL).toBe(
      "https://opencode.ai/inference/openai/v1"
    );
  });
});

describe("web search provider contracts", () => {
  test("defaults to DeepSeek with an empty base URL", () => {
    const parsed = webSearchProviderConfigInputSchema.parse({
      apiKey: "sk-search",
    });

    expect(parsed.provider).toBe("deepseek");
    expect(parsed.baseUrl).toBe("");
    expect(parsed.enabled).toBe(true);
  });

  test("requires a search key of its own", () => {
    const result = webSearchProviderConfigInputSchema.safeParse({
      apiKey: "",
    });

    expect(result.success).toBe(false);
  });

  test("rejects a malformed base URL", () => {
    const result = webSearchProviderConfigInputSchema.safeParse({
      apiKey: "sk-search",
      baseUrl: "not a url",
    });

    expect(result.success).toBe(false);
  });
});

describe("provider model list contracts", () => {
  test("defaults the base URL to empty so the server can fall back", () => {
    const parsed = providerModelListInputSchema.parse({ provider: "opencode" });

    expect(parsed.baseUrl).toBe("");
  });
});
