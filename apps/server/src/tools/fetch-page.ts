import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));

import { fetchPageDef, fetchPageInputSchema } from "@neobuni/contracts";

import { fetchPageWithProvider } from "../integrations/web/dispatch";
import {
  requireWebProvider,
  resolveWebProvider,
} from "../integrations/web/provider";
import type { ServerToolContext } from "./types";

interface FetchPageDeps {
  appendEvent: typeof appendEvent;
  fetchPageWithProvider: typeof fetchPageWithProvider;
  resolveWebProvider: typeof resolveWebProvider;
}

const createFetchPageTool = (
  context: ServerToolContext,
  deps: FetchPageDeps = {
    appendEvent,
    fetchPageWithProvider,
    resolveWebProvider,
  }
) =>
  fetchPageDef.server(async (args) => {
    const input = fetchPageInputSchema.parse(args);
    const provider = await requireWebProvider(
      context.profileId,
      deps.resolveWebProvider
    );
    const result = await deps.fetchPageWithProvider({
      provider,
      signal: context.abortSignal,
      url: input.url,
    });

    await deps.appendEvent(context.profileId, "tool.fetch_page", {
      conversationId: context.conversationId,
      turnId: context.turnId,
      provider: result.provider,
      url: input.url,
    });

    return result;
  });

export { createFetchPageTool };
