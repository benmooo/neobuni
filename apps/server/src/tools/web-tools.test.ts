import {
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

const appendEventMock = vi.fn(async () => ({
  id: "event-1",
  profileId: "profile-1",
  type: "tool.test",
  payload: {},
  createdAt: "2026-06-13T00:00:00.000Z",
}));

const fetchWebclawPageMock = vi.fn(async () => ({
  provider: "webclaw" as const,
  document: {
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
  },
}));

const fetchWebclawExtractMock = vi.fn(async () => ({
  provider: "webclaw" as const,
  data: {
    tiers: [{ name: "Pro", price: 49 }],
  },
  generatedSchema: {
    type: "object",
  },
}));

const fetchWebclawSearchMock = vi.fn(async () => ({
  provider: "webclaw" as const,
  query: "buni ai agents site:github.com",
  items: [
    {
      rank: 1,
      title: "Buni Web Tools",
      url: "https://github.com/aka/buni",
      snippet: "A first version of web tools for Buni.",
      sourceName: "GitHub",
      publishedAt: "2026-06-13T00:00:00.000Z",
    },
  ],
}));

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

describe("p0 web tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("open_url returns the normalized page result and appends an event", async () => {
    const { createOpenUrlTool } = await import("./open-url");
    const tool = createOpenUrlTool(createToolContext(), {
      appendEvent: appendEventMock,
      fetchWebclawPage: fetchWebclawPageMock,
    });
    if (!tool.execute) {
      throw new Error("Expected open_url tool.execute.");
    }
    const result = await tool.execute({
      url: "https://example.com/post",
    });

    expect(fetchWebclawPageMock).toHaveBeenCalledTimes(1);
    expect(appendEventMock).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe("webclaw");
    expect(result.document.title).toBe("Example Post");
  });

  test("extract_page returns extracted data with the source document", async () => {
    const { createExtractPageTool } = await import("./extract-page");
    const tool = createExtractPageTool(createToolContext(), {
      appendEvent: appendEventMock,
      fetchWebclawExtract: fetchWebclawExtractMock,
      fetchWebclawPage: fetchWebclawPageMock,
    });
    if (!tool.execute) {
      throw new Error("Expected extract_page tool.execute.");
    }
    const result = await tool.execute({
      url: "https://example.com/pricing",
      instruction: "Extract pricing tiers",
    });

    expect(fetchWebclawPageMock).toHaveBeenCalledTimes(1);
    expect(fetchWebclawExtractMock).toHaveBeenCalledTimes(1);
    expect(appendEventMock).toHaveBeenCalledTimes(1);
    expect(result.document.title).toBe("Example Post");
    expect(result.data).toEqual({
      tiers: [{ name: "Pro", price: 49 }],
    });
  });

  test("save_page_to_knowledge bridges normalized page content into knowledge ingest", async () => {
    const { createSavePageToKnowledgeTool } = await import("./save-page-to-knowledge");
    const tool = createSavePageToKnowledgeTool(createToolContext(), {
      appendEvent: appendEventMock,
      fetchWebclawPage: fetchWebclawPageMock,
      saveWebPageToKnowledge: saveWebPageToKnowledgeMock,
    });
    if (!tool.execute) {
      throw new Error("Expected save_page_to_knowledge tool.execute.");
    }
    const result = await tool.execute({
      url: "https://example.com/post",
      trustLevel: "curated",
    });

    expect(fetchWebclawPageMock).toHaveBeenCalledTimes(1);
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
      fetchWebclawSearch: fetchWebclawSearchMock,
    });
    if (!tool.execute) {
      throw new Error("Expected search_web tool.execute.");
    }
    const result = await tool.execute({
      query: "buni ai agents",
      domain: "github.com",
      limit: 5,
    });

    expect(fetchWebclawSearchMock).toHaveBeenCalledTimes(1);
    const searchCall = fetchWebclawSearchMock.mock.calls[0] as unknown as
      | [Record<string, unknown>]
      | undefined;
    expect(searchCall?.[0]).toEqual({
      query: "buni ai agents site:github.com",
      limit: 5,
      signal: context.abortSignal,
    });
    expect(appendEventMock).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe("webclaw");
    expect(result.count).toBe(1);
    expect(result.items[0]?.title).toBe("Buni Web Tools");
  });

  test("summarize_page summarizes the normalized page content and appends an event", async () => {
    const { createSummarizePageTool } = await import("./summarize-page");
    const tool = createSummarizePageTool(createToolContext(), {
      appendEvent: appendEventMock,
      fetchWebclawPage: fetchWebclawPageMock,
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

    expect(fetchWebclawPageMock).toHaveBeenCalledTimes(1);
    expect(summarizeWebPageMock).toHaveBeenCalledTimes(1);
    expect(appendEventMock).toHaveBeenCalledTimes(1);
    expect(result.document.title).toBe("Example Post");
    expect(result.summary).toBe("Buni now supports summarizing normalized web pages.");
    expect(result.notes).toEqual(["goal_applied"]);
  });
});
