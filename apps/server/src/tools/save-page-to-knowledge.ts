import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));

import {
  savePageToKnowledgeDef,
  savePageToKnowledgeInputSchema,
} from "@neobuni/contracts";

import { fetchWebclawPage } from "../integrations/web/webclaw";
import { saveWebPageToKnowledge } from "../web/save-web-page-to-knowledge";
import type { ServerToolContext } from "./types";

interface SavePageToKnowledgeDeps {
  appendEvent: typeof appendEvent;
  fetchWebclawPage: typeof fetchWebclawPage;
  saveWebPageToKnowledge: typeof saveWebPageToKnowledge;
}

const createSavePageToKnowledgeTool = (
  context: ServerToolContext,
  deps: SavePageToKnowledgeDeps = {
    appendEvent,
    fetchWebclawPage,
    saveWebPageToKnowledge,
  }
) =>
  savePageToKnowledgeDef.server(async (args) => {
    const input = savePageToKnowledgeInputSchema.parse(args);
    const page = await deps.fetchWebclawPage({
      url: input.url,
      signal: context.abortSignal,
    });
    const data = await deps.saveWebPageToKnowledge({
      profileId: context.profileId,
      url: input.url,
      title: input.title,
      trustLevel: input.trustLevel,
      document: page.document,
    });

    await deps.appendEvent(context.profileId, "tool.save_page_to_knowledge", {
      conversationId: context.conversationId,
      turnId: context.turnId,
      provider: page.provider,
      url: input.url,
      documentId: data.documentId,
      created: data.created,
    });

    return {
      saved: true,
      documentId: data.documentId,
      created: data.created,
      chunkCount: data.chunkCount,
      factCount: data.factCount,
      sourceUri: page.document.finalUrl,
      note: data.created
        ? "Saved page to knowledge."
        : "Matching page already exists in knowledge.",
    };
  });

export { createSavePageToKnowledgeTool };
