import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));

import { searchWebDef, searchWebInputSchema } from "@neobuni/contracts";

import { fetchWebclawSearch } from "../integrations/web/webclaw";
import type { ServerToolContext } from "./types";

interface SearchWebDeps {
  appendEvent: typeof appendEvent;
  fetchWebclawSearch: typeof fetchWebclawSearch;
}

const normalizeSearchQuery = (input: { query: string; domain?: string }) =>
  input.domain ? `${input.query} site:${input.domain}` : input.query;

const createSearchWebTool = (
  context: ServerToolContext,
  deps: SearchWebDeps = {
    appendEvent,
    fetchWebclawSearch,
  }
) =>
  searchWebDef.server(async (args) => {
    const input = searchWebInputSchema.parse(args);
    const result = await deps.fetchWebclawSearch({
      query: normalizeSearchQuery(input),
      limit: input.limit,
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
