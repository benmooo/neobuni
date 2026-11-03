import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));

import {
  searchKnowledgeDef,
  searchKnowledgeInputSchema,
} from "@neobuni/contracts";
import { extractMemoryKeywords } from "@neobuni/core";

import { searchKnowledge } from "../memory/knowledge-store";
import type { ServerToolContext } from "./types";

interface SearchKnowledgeDeps {
  appendEvent: typeof appendEvent;
  searchKnowledge: typeof searchKnowledge;
}

const createSearchKnowledgeTool = (
  context: ServerToolContext,
  deps: SearchKnowledgeDeps = { appendEvent, searchKnowledge }
) =>
  searchKnowledgeDef.server(async (args) => {
    const input = searchKnowledgeInputSchema.parse(args);
    const result = await deps.searchKnowledge({
      documentTitle: input.documentTitle,
      embeddingConfig: context.embeddingConfig,
      keywords: extractMemoryKeywords(input.query).slice(0, 8),
      limit: input.limit,
      profileId: context.profileId,
      query: input.query,
    });

    await deps.appendEvent(context.profileId, "tool.search_knowledge", {
      conversationId: context.conversationId,
      turnId: context.turnId,
      query: input.query,
      count: result.items.length,
      documentTitle: input.documentTitle ?? null,
    });

    return {
      query: input.query,
      count: result.items.length,
      items: result.items.map((item) => ({
        chapter: item.chapter,
        chunkId: item.chunkId,
        chunkIndex: item.chunkIndex,
        documentId: item.documentId,
        documentTitle: item.documentTitle,
        locator: item.locator,
        page: item.page,
        pageEnd: item.pageEnd,
        score: item.score,
        text: item.text,
      })),
    };
  });

export { createSearchKnowledgeTool };
