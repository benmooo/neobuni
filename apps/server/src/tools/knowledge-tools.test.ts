import { beforeEach, describe, expect, test, vi } from "vitest";

import type { searchKnowledge } from "../memory/knowledge-store";

const appendEventMock = vi.fn(async () => ({
  id: "event-1",
  profileId: "profile-1",
  type: "tool.test",
  payload: {},
  createdAt: "2026-06-13T00:00:00.000Z",
}));

const searchKnowledgeMock = vi.fn(
  async (
    _input: Parameters<typeof searchKnowledge>[0]
  ): Promise<Awaited<ReturnType<typeof searchKnowledge>>> => ({
    items: [
      {
        chapter: "第2章 计算机系统基础知识",
        chunkId: "chunk-1",
        chunkIndex: 4,
        documentId: "doc-1",
        documentTitle: "系统架构设计师教程（第2版）",
        keywords: ["缓存", "存储"],
        locator: "【第2章 计算机系统基础知识 · p.36】",
        page: 36,
        pageEnd: null,
        score: 0.82,
        text: "片上缓存直接集成在处理器核心中。",
        tokenCount: 120,
      },
    ],
    stats: { keywordHitCount: 1, returnedItemCount: 1, vectorHitCount: 1 },
    store: "knowledge",
  })
);

const listKnowledgeDocumentsVisibleMock = vi.fn(async () => [
  {
    checksum: "checksum-1",
    chunkCount: 682,
    createdAt: "2026-11-02T08:45:00.000Z",
    factCount: 0,
    id: "doc-1",
    profileId: "profile-1",
    scope: "profile" as const,
    sourceType: "pdf",
    sourceUri: null,
    status: "active",
    title: "系统架构设计师教程（第2版）",
    trustLevel: "curated" as const,
    updatedAt: "2026-11-02T08:50:00.000Z",
  },
]);

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

describe("knowledge tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("search_knowledge returns citations and logs the query", async () => {
    const { createSearchKnowledgeTool } = await import("./search-knowledge");
    const tool = createSearchKnowledgeTool(createToolContext(), {
      appendEvent: appendEventMock,
      searchKnowledge: searchKnowledgeMock,
    });
    if (!tool.execute) {
      throw new Error("Expected search_knowledge tool.execute.");
    }

    const result = await tool.execute({
      query: "缓存命中率 第几章",
      limit: 5,
    });

    expect(searchKnowledgeMock).toHaveBeenCalledTimes(1);
    expect(searchKnowledgeMock.mock.calls[0]?.[0]).toMatchObject({
      limit: 5,
      profileId: "profile-1",
      query: "缓存命中率 第几章",
    });
    expect(appendEventMock).toHaveBeenCalledTimes(1);
    expect(result.count).toBe(1);
    expect(result.items[0]).toMatchObject({
      chapter: "第2章 计算机系统基础知识",
      locator: "【第2章 计算机系统基础知识 · p.36】",
      page: 36,
      text: "片上缓存直接集成在处理器核心中。",
    });
  });

  test("list_knowledge lists visible documents with chunk counts", async () => {
    const { createListKnowledgeTool } = await import("./list-knowledge");
    const tool = createListKnowledgeTool(createToolContext(), {
      appendEvent: appendEventMock,
      listKnowledgeDocumentsVisible: listKnowledgeDocumentsVisibleMock,
    });
    if (!tool.execute) {
      throw new Error("Expected list_knowledge tool.execute.");
    }

    const result = await tool.execute({ limit: 10 });

    expect(listKnowledgeDocumentsVisibleMock).toHaveBeenCalledWith("profile-1");
    expect(appendEventMock).toHaveBeenCalledTimes(1);
    expect(result.count).toBe(1);
    expect(result.documents[0]).toMatchObject({
      chunkCount: 682,
      title: "系统架构设计师教程（第2版）",
    });
  });
});
