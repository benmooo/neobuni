import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  fetchPageWithProvider,
  searchWithProvider,
} from "../integrations/web/dispatch";

const appendEventMock = vi.fn(async () => ({
  id: "event-1",
  profileId: "profile-1",
  type: "tool.test",
  payload: {},
  createdAt: "2026-06-13T00:00:00.000Z",
}));

const provider = {
  apiKey: "sk-deepseek",
  baseUrl: "https://api.deepseek.com",
  kind: "deepseek" as const,
};

const resolveWebProviderMock = vi.fn(async () => provider);

const pageDocument = {
  url: "https://example.com/post",
  finalUrl: "https://example.com/post",
  title: "Example Post",
  siteName: "Example",
  byline: "Aka",
  publishedAt: "2026-06-13T00:00:00.000Z",
  language: "en",
  excerpt: "Example excerpt",
  markdown: "# Example Post",
  plainText: "Example Post",
  statusCode: 200,
  extractionMethod: "provider" as const,
  warnings: [],
  fetchedAt: "2026-06-13T00:00:00.000Z",
};

const fetchPageWithProviderMock = vi.fn(
  async (
    _input: Parameters<typeof fetchPageWithProvider>[0]
  ): Promise<Awaited<ReturnType<typeof fetchPageWithProvider>>> => ({
    provider: "deepseek",
    document: pageDocument,
  })
);

const extractWebPageMock = vi.fn(async () => ({
  data: {
    tiers: [{ name: "Pro", price: 49 }],
  },
  generatedSchema: null,
  notes: [],
}));

const searchWithProviderMock = vi.fn(
  async (
    _input: Parameters<typeof searchWithProvider>[0]
  ): Promise<Awaited<ReturnType<typeof searchWithProvider>>> => ({
    provider: "deepseek",
    query: "buni ai agents site:github.com",
    items: [
      {
        authority: null,
        rank: 1,
        rerankScore: null,
        summary: null,
        title: "Buni Web Tools",
        url: "https://github.com/aka/buni",
        snippet: "A first version of web tools for Buni.",
        sourceName: "GitHub",
        publishedAt: "2026-06-13T00:00:00.000Z",
      },
    ],
  })
);

const saveWebPageToKnowledgeMock = vi.fn(async () => ({
  documentId: "knowledge-doc-1",
  created: true,
  chunkCount: 2,
  factCount: 1,
}));

const summarizeWebPageMock = vi.fn(async () => ({
  summary: "Buni now supports summarizing normalized web pages.",
  notes: ["goal_applied"],
}));

const createToolContext = () => ({
  profileId: "profile-1",
  conversationId: "conversation-1",
  turnId: "turn-1",
  clientTimezone: "Asia/Shanghai",
  profileTimezone: "Asia/Shanghai",
  defaultTimezone: "Asia/Shanghai",
  referenceNow: "2026-06-13T00:00:00.000Z",
  embeddingConfig: null,
  abortSignal: new AbortController().signal,
});

describe("web tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveWebProviderMock.mockResolvedValue(provider);
  });

  test("fetch_page fetches through the resolved provider and appends an event", async () => {
    const { createFetchPageTool } = await import("./fetch-page");
    const tool = createFetchPageTool(createToolContext(), {
      appendEvent: appendEventMock,
      fetchPageWithProvider: fetchPageWithProviderMock,
      resolveWebProvider: resolveWebProviderMock,
    });
    if (!tool.execute) {
      throw new Error("Expected fetch_page tool.execute.");
    }
    const result = await tool.execute({
      url: "https://example.com/post",
    });

    expect(fetchPageWithProviderMock).toHaveBeenCalledTimes(1);
    expect(fetchPageWithProviderMock.mock.calls[0]?.[0]).toMatchObject({
      provider,
      url: "https://example.com/post",
    });
    expect(appendEventMock).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe("deepseek");
    expect(result.document.title).toBe("Example Post");
  });

  test("extract_page fetches the page and extracts structured data", async () => {
    const { createExtractPageTool } = await import("./extract-page");
    const tool = createExtractPageTool(createToolContext(), {
      appendEvent: appendEventMock,
      extractWebPage: extractWebPageMock,
      fetchPageWithProvider: fetchPageWithProviderMock,
      resolveWebProvider: resolveWebProviderMock,
    });
    if (!tool.execute) {
      throw new Error("Expected extract_page tool.execute.");
    }
    const result = await tool.execute({
      url: "https://example.com/pricing",
      instruction: "Extract pricing tiers",
    });

    expect(fetchPageWithProviderMock).toHaveBeenCalledTimes(1);
    expect(extractWebPageMock).toHaveBeenCalledTimes(1);
    expect(appendEventMock).toHaveBeenCalledTimes(1);
    expect(result.document.title).toBe("Example Post");
    expect(result.data).toEqual({
      tiers: [{ name: "Pro", price: 49 }],
    });
  });

  test("save_page_to_knowledge bridges normalized page content into knowledge ingest", async () => {
    const { createSavePageToKnowledgeTool } = await import(
      "./save-page-to-knowledge"
    );
    const tool = createSavePageToKnowledgeTool(createToolContext(), {
      appendEvent: appendEventMock,
      fetchPageWithProvider: fetchPageWithProviderMock,
      resolveWebProvider: resolveWebProviderMock,
      saveWebPageToKnowledge: saveWebPageToKnowledgeMock,
    });
    if (!tool.execute) {
      throw new Error("Expected save_page_to_knowledge tool.execute.");
    }
    const result = await tool.execute({
      url: "https://example.com/post",
      trustLevel: "curated",
    });

    expect(fetchPageWithProviderMock).toHaveBeenCalledTimes(1);
    expect(saveWebPageToKnowledgeMock).toHaveBeenCalledTimes(1);
    expect(appendEventMock).toHaveBeenCalledTimes(1);
    expect(result.saved).toBe(true);
    expect(result.documentId).toBe("knowledge-doc-1");
    expect(result.sourceUri).toBe("https://example.com/post");
  });

  test("search_web returns candidate pages and appends an event", async () => {
    const { createSearchWebTool } = await import("./search-web");
    const context = createToolContext();
    const tool = createSearchWebTool(context, {
      appendEvent: appendEventMock,
      resolveWebProvider: resolveWebProviderMock,
      searchWithProvider: searchWithProviderMock,
    });
    if (!tool.execute) {
      throw new Error("Expected search_web tool.execute.");
    }
    const result = await tool.execute({
      query: "buni ai agents",
      domain: "github.com",
      limit: 5,
    });

    expect(searchWithProviderMock).toHaveBeenCalledTimes(1);
    expect(searchWithProviderMock.mock.calls[0]?.[0]).toMatchObject({
      count: 5,
      provider,
      query: "buni ai agents site:github.com",
      signal: context.abortSignal,
    });
    expect(appendEventMock).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe("deepseek");
    expect(result.count).toBe(1);
    expect(result.items[0]?.title).toBe("Buni Web Tools");
  });

  test("summarize_page summarizes the normalized page content and appends an event", async () => {
    const { createSummarizePageTool } = await import("./summarize-page");
    const tool = createSummarizePageTool(createToolContext(), {
      appendEvent: appendEventMock,
      fetchPageWithProvider: fetchPageWithProviderMock,
      resolveWebProvider: resolveWebProviderMock,
      summarizeWebPage: summarizeWebPageMock,
    });
    if (!tool.execute) {
      throw new Error("Expected summarize_page tool.execute.");
    }
    const result = await tool.execute({
      url: "https://example.com/post",
      goal: "Focus on the web tool rollout",
      length: "short",
    });

    expect(fetchPageWithProviderMock).toHaveBeenCalledTimes(1);
    expect(summarizeWebPageMock).toHaveBeenCalledTimes(1);
    expect(appendEventMock).toHaveBeenCalledTimes(1);
    expect(result.document.title).toBe("Example Post");
    expect(result.summary).toBe(
      "Buni now supports summarizing normalized web pages."
    );
    expect(result.notes).toEqual(["goal_applied"]);
  });

  test("fails with an actionable message when no provider is configured", async () => {
    const { createSearchWebTool } = await import("./search-web");
    const tool = createSearchWebTool(createToolContext(), {
      appendEvent: appendEventMock,
      resolveWebProvider: async () => null,
      searchWithProvider: searchWithProviderMock,
    });
    if (!tool.execute) {
      throw new Error("Expected search_web tool.execute.");
    }

    await expect(tool.execute({ query: "buni", limit: 3 })).rejects.toThrow(
      "No web search provider configured"
    );
    expect(searchWithProviderMock).not.toHaveBeenCalled();
  });
});
