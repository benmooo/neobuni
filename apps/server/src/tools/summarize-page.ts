import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));

import { summarizePageDef, summarizePageInputSchema } from "@neobuni/contracts";

import { fetchPageWithProvider } from "../integrations/web/dispatch";
import {
  requireWebProvider,
  resolveWebProvider,
} from "../integrations/web/provider";
import { summarizeWebPage } from "../web/summarize-web-page";
import type { ServerToolContext } from "./types";

interface SummarizePageDeps {
  appendEvent: typeof appendEvent;
  fetchPageWithProvider: typeof fetchPageWithProvider;
  resolveWebProvider: typeof resolveWebProvider;
  summarizeWebPage: typeof summarizeWebPage;
}

const createSummarizePageTool = (
  context: ServerToolContext,
  deps: SummarizePageDeps = {
    appendEvent,
    fetchPageWithProvider,
    resolveWebProvider,
    summarizeWebPage,
  }
) =>
  summarizePageDef.server(async (args) => {
    const input = summarizePageInputSchema.parse(args);
    const provider = await requireWebProvider(
      context.profileId,
      deps.resolveWebProvider
    );
    const page = await deps.fetchPageWithProvider({
      provider,
      signal: context.abortSignal,
      url: input.url,
    });
    const summary = await deps.summarizeWebPage({
      profileId: context.profileId,
      document: page.document,
      goal: input.goal,
      length: input.length,
      signal: context.abortSignal,
    });

    await deps.appendEvent(context.profileId, "tool.summarize_page", {
      conversationId: context.conversationId,
      turnId: context.turnId,
      provider: page.provider,
      url: input.url,
      length: input.length,
    });

    return {
      document: {
        url: page.document.url,
        finalUrl: page.document.finalUrl,
        title: page.document.title,
        siteName: page.document.siteName,
        publishedAt: page.document.publishedAt,
      },
      summary: summary.summary,
      notes: summary.notes,
    };
  });

export { createSummarizePageTool };
