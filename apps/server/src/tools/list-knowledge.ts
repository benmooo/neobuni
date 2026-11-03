import {
  appendEvent as appendEventFx,
  listKnowledgeDocumentsVisible as listKnowledgeDocumentsVisibleFx,
  runRepo,
} from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));
const listKnowledgeDocumentsVisible = (
  ...args: Parameters<typeof listKnowledgeDocumentsVisibleFx>
) => runRepo(listKnowledgeDocumentsVisibleFx(...args));

import { listKnowledgeDef, listKnowledgeInputSchema } from "@neobuni/contracts";

import type { ServerToolContext } from "./types";

interface ListKnowledgeDeps {
  appendEvent: typeof appendEvent;
  listKnowledgeDocumentsVisible: typeof listKnowledgeDocumentsVisible;
}

const createListKnowledgeTool = (
  context: ServerToolContext,
  deps: ListKnowledgeDeps = {
    appendEvent,
    listKnowledgeDocumentsVisible,
  }
) =>
  listKnowledgeDef.server(async (args) => {
    const input = listKnowledgeInputSchema.parse(args);
    const documents = await deps.listKnowledgeDocumentsVisible(
      context.profileId
    );
    const visible = documents.slice(0, input.limit).map((document) => ({
      chunkCount: document.chunkCount,
      id: document.id,
      sourceType: document.sourceType,
      title: document.title,
      trustLevel: document.trustLevel,
      updatedAt: document.updatedAt,
    }));

    await deps.appendEvent(context.profileId, "tool.list_knowledge", {
      conversationId: context.conversationId,
      turnId: context.turnId,
      count: visible.length,
    });

    return {
      count: visible.length,
      documents: visible,
    };
  });

export { createListKnowledgeTool };
