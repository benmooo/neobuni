import {
  type DeepSeekDeps,
  fetchDeepSeekPage,
  searchDeepSeek,
} from "./deepseek-search";
import type { ResolvedWebProvider } from "./provider";
import type { WebPageResult, WebProviderName, WebSearchResult } from "./types";
import {
  DEFAULT_WEB_TIMEOUT_MS,
  fetchWebclawPage,
  fetchWebclawSearch,
  type WebclawDeps,
} from "./webclaw";

const webclawConfig = (provider: ResolvedWebProvider) => ({
  apiKey: provider.apiKey,
  baseUrl: provider.baseUrl,
  timeoutMs: DEFAULT_WEB_TIMEOUT_MS,
});

/**
 * Runs a search against whichever backend `resolveWebProvider` picked, so a
 * Webclaw key is never sent to the DeepSeek endpoint (and vice versa).
 */
type DispatchDeps = Partial<DeepSeekDeps & WebclawDeps>;

const searchWithProvider = async (input: {
  count: number;
  deps?: DispatchDeps;
  oriQuestion?: string;
  provider: ResolvedWebProvider;
  query: string;
  signal?: AbortSignal;
}): Promise<WebSearchResult<WebProviderName>> => {
  if (input.provider.kind === "webclaw") {
    return await fetchWebclawSearch({
      config: webclawConfig(input.provider),
      deps: input.deps,
      limit: input.count,
      query: input.query,
      signal: input.signal,
    });
  }

  return await searchDeepSeek({
    apiKey: input.provider.apiKey,
    baseUrl: input.provider.baseUrl,
    count: input.count,
    deps: input.deps,
    needContent: false,
    oriQuestion: input.oriQuestion,
    query: input.query,
    signal: input.signal,
  });
};

const fetchPageWithProvider = async (input: {
  deps?: DispatchDeps;
  provider: ResolvedWebProvider;
  signal?: AbortSignal;
  url: string;
}): Promise<WebPageResult<WebProviderName>> => {
  if (input.provider.kind === "webclaw") {
    return await fetchWebclawPage({
      config: webclawConfig(input.provider),
      deps: input.deps,
      signal: input.signal,
      url: input.url,
    });
  }

  return await fetchDeepSeekPage({
    apiKey: input.provider.apiKey,
    baseUrl: input.provider.baseUrl,
    deps: input.deps,
    signal: input.signal,
    url: input.url,
  });
};

export { fetchPageWithProvider, searchWithProvider };
