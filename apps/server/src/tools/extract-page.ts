import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));

import { extractPageDef, extractPageInputSchema } from "@neobuni/contracts";

import { fetchPageWithProvider } from "../integrations/web/dispatch";
import {
  requireWebProvider,
  resolveWebProvider,
} from "../integrations/web/provider";
import { extractWebPage } from "../web/extract-web-page";
import type { ServerToolContext } from "./types";

interface ExtractPageDeps {
  appendEvent: typeof appendEvent;
  extractWebPage: typeof extractWebPage;
  fetchPageWithProvider: typeof fetchPageWithProvider;
  resolveWebProvider: typeof resolveWebProvider;
}

const createExtractPageTool = (
  context: ServerToolContext,
  deps: ExtractPageDeps = {
    appendEvent,
    extractWebPage,
    fetchPageWithProvider,
    resolveWebProvider,
  }
) =>
  extractPageDef.server(async (args) => {
    const input = extractPageInputSchema.parse(args);
    const provider = await requireWebProvider(
      context.profileId,
      deps.resolveWebProvider
    );
    const page = await deps.fetchPageWithProvider({
      provider,
      signal: context.abortSignal,
      url: input.url,
    });
    const extracted = await deps.extractWebPage({
      profileId: context.profileId,
      document: page.document,
      instruction: input.instruction,
      schema: input.schema,
      signal: context.abortSignal,
    });

    await deps.appendEvent(context.profileId, "tool.extract_page", {
      conversationId: context.conversationId,
      turnId: context.turnId,
      provider: page.provider,
      url: input.url,
    });

    return {
      provider: page.provider,
      document: page.document,
      data: extracted.data,
      generatedSchema: extracted.generatedSchema,
    };
  });

export { createExtractPageTool };
