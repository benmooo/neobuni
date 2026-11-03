import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));

import {
  savePageToKnowledgeDef,
  savePageToKnowledgeInputSchema,
} from "@neobuni/contracts";

import { fetchPageWithProvider } from "../integrations/web/dispatch";
import {
  requireWebProvider,
  resolveWebProvider,
} from "../integrations/web/provider";
import { saveWebPageToKnowledge } from "../web/save-web-page-to-knowledge";
import type { ServerToolContext } from "./types";

interface SavePageToKnowledgeDeps {
  appendEvent: typeof appendEvent;
  fetchPageWithProvider: typeof fetchPageWithProvider;
  resolveWebProvider: typeof resolveWebProvider;
  saveWebPageToKnowledge: typeof saveWebPageToKnowledge;
}

const createSavePageToKnowledgeTool = (
  context: ServerToolContext,
  deps: SavePageToKnowledgeDeps = {
    appendEvent,
    fetchPageWithProvider,
    resolveWebProvider,
    saveWebPageToKnowledge,
  }
) =>
  savePageToKnowledgeDef.server(async (args) => {
    const input = savePageToKnowledgeInputSchema.parse(args);
    const provider = await requireWebProvider(
      context.profileId,
      deps.resolveWebProvider
    );
    const page = await deps.fetchPageWithProvider({
      provider,
      signal: context.abortSignal,
      url: input.url,
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
