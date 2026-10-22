import { describe, expect, test, vi } from "vitest";

const createProviderConfig = (slot: "chat" | "memory_reasoning") => ({
  id: `provider-config-${slot}`,
  profileId: "profile-1",
  slot,
  provider: "openai" as const,
  protocol: "openai" as const,
  model: "gpt-4o-mini",
  apiKey: "sk-test",
  baseUrl: "https://api.openai.com/v1",
  enabled: true,
  metadata: {},
  createdAt: "2026-06-13T00:00:00.000Z",
  updatedAt: "2026-06-13T00:00:00.000Z",
});

const createDocument = (
  overrides: Partial<{
    markdown: string;
    plainText: string;
  }> = {}
) => ({
  url: "https://example.com/post",
  finalUrl: "https://example.com/post",
  title: "Example Post",
  siteName: "Example",
  byline: "Aka",
  publishedAt: "2026-06-13T00:00:00.000Z",
  language: "en",
  excerpt: "Example excerpt",
  markdown: "# Example Post\n\nBuni adds web tools.",
  plainText: "Example Post. Buni adds web tools.",
  statusCode: 200,
  extractionMethod: "provider" as const,
  warnings: [],
  fetchedAt: "2026-06-13T00:00:00.000Z",
  ...overrides,
});

describe("summarizeWebPage", () => {
  test("uses memory reasoning config first and records deterministic notes", async () => {
    const mod = await import("./summarize-web-page");

    if (!("summarizeWebPage" in mod)) {
      throw new Error("Expected summarizeWebPage export.");
    }

    const getMemoryReasoningProviderConfig = vi.fn(async () =>
      createProviderConfig("memory_reasoning")
    );
    const getProviderConfig = vi.fn(async () => createProviderConfig("chat"));
    const createChatCompletion = vi.fn(
      async () => "Buni now supports normalized web-page summaries."
    );

    const result = await mod.summarizeWebPage({
      profileId: "profile-1",
      document: createDocument(),
      goal: "Focus on the new web tools",
      length: "short",
      deps: {
        getMemoryReasoningProviderConfig,
        getProviderConfig,
        createChatCompletion,
      },
    });

    expect(result.summary).toBe(
      "Buni now supports normalized web-page summaries."
    );
    expect(result.notes).toEqual(["goal_applied"]);
    expect(getMemoryReasoningProviderConfig.mock.calls).toHaveLength(1);
    expect(getProviderConfig.mock.calls).toHaveLength(0);
    expect(createChatCompletion.mock.calls).toHaveLength(1);
    const completionCall = createChatCompletion.mock.calls[0] as unknown as
      | [unknown, Array<{ role: string; content: string }>, unknown?]
      | undefined;
    expect(String(completionCall?.[1]?.[1]?.content)).toContain(
      "Focus on the new web tools"
    );
  });

  test("falls back to the chat provider when memory reasoning is unavailable", async () => {
    const mod = await import("./summarize-web-page");

    if (!("summarizeWebPage" in mod)) {
      throw new Error("Expected summarizeWebPage export.");
    }

    const getMemoryReasoningProviderConfig = vi.fn(async () => null);
    const getProviderConfig = vi.fn(async () => createProviderConfig("chat"));
    const createChatCompletion = vi.fn(async () => "Fallback summary.");

    const result = await mod.summarizeWebPage({
      profileId: "profile-1",
      document: createDocument(),
      length: "medium",
      deps: {
        getMemoryReasoningProviderConfig,
        getProviderConfig,
        createChatCompletion,
      },
    });

    expect(result.summary).toBe("Fallback summary.");
    expect(result.notes).toEqual([]);
    expect(getMemoryReasoningProviderConfig.mock.calls).toHaveLength(1);
    expect(getProviderConfig.mock.calls).toHaveLength(1);
    expect(createChatCompletion.mock.calls).toHaveLength(1);
  });
});
