import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));

import { extractPageDef, extractPageInputSchema } from "@neobuni/contracts";

import {
  fetchWebclawExtract,
  fetchWebclawPage,
} from "../integrations/web/webclaw";
import type { ServerToolContext } from "./types";

interface ExtractPageDeps {
  appendEvent: typeof appendEvent;
  fetchWebclawExtract: typeof fetchWebclawExtract;
  fetchWebclawPage: typeof fetchWebclawPage;
}

const createExtractPageTool = (
  context: ServerToolContext,
  deps: ExtractPageDeps = {
    appendEvent,
    fetchWebclawExtract,
    fetchWebclawPage,
  }
) =>
  extractPageDef.server(async (args) => {
    const input = extractPageInputSchema.parse(args);
    const [page, extracted] = await Promise.all([
      deps.fetchWebclawPage({
        url: input.url,
        signal: context.abortSignal,
      }),
      deps.fetchWebclawExtract({
        url: input.url,
        instruction: input.instruction,
        schema: input.schema,
        signal: context.abortSignal,
      }),
    ]);

    await deps.appendEvent(context.profileId, "tool.extract_page", {
      conversationId: context.conversationId,
      turnId: context.turnId,
      provider: extracted.provider,
      url: input.url,
    });

    return {
      provider: extracted.provider,
      document: page.document,
      data: extracted.data,
      generatedSchema: extracted.generatedSchema,
    };
  });

export { createExtractPageTool };
