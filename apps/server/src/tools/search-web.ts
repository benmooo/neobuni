import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));

import { searchWebDef, searchWebInputSchema } from "@neobuni/contracts";

import { searchWithProvider } from "../integrations/web/dispatch";
import {
  requireWebProvider,
  resolveWebProvider,
} from "../integrations/web/provider";
import type { ServerToolContext } from "./types";

interface SearchWebDeps {
  appendEvent: typeof appendEvent;
  resolveWebProvider: typeof resolveWebProvider;
  searchWithProvider: typeof searchWithProvider;
}

const normalizeSearchQuery = (input: { query: string; domain?: string }) =>
  input.domain ? `${input.query} site:${input.domain}` : input.query;

const createSearchWebTool = (
  context: ServerToolContext,
  deps: SearchWebDeps = {
    appendEvent,
    resolveWebProvider,
    searchWithProvider,
  }
) =>
  searchWebDef.server(async (args) => {
    const input = searchWebInputSchema.parse(args);
    const provider = await requireWebProvider(
      context.profileId,
      deps.resolveWebProvider
    );
    const result = await deps.searchWithProvider({
      count: input.limit,
      provider,
      query: normalizeSearchQuery(input),
      signal: context.abortSignal,
    });

    await deps.appendEvent(context.profileId, "tool.search_web", {
      conversationId: context.conversationId,
      turnId: context.turnId,
      provider: result.provider,
      query: result.query,
      count: result.items.length,
    });

    return {
      provider: result.provider,
      query: result.query,
      count: result.items.length,
      items: result.items,
    };
  });

export { createSearchWebTool, normalizeSearchQuery };
