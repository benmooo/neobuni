import {
  type DeepSeekDeps,
  fetchDeepSeekPage,
  searchDeepSeek,
} from "./deepseek-search";
import type { ResolvedWebProvider } from "./provider";
import type { WebPageResult, WebSearchResult } from "./types";

type DispatchDeps = Partial<DeepSeekDeps>;

/**
 * Runs a search through the profile's resolved provider. The wrapper keeps the
 * tool and Scout call sites independent of the concrete search backend.
 */
const searchWithProvider = async (input: {
  count: number;
  deps?: DispatchDeps;
  oriQuestion?: string;
  provider: ResolvedWebProvider;
  query: string;
  signal?: AbortSignal;
}): Promise<WebSearchResult> =>
  await searchDeepSeek({
    apiKey: input.provider.apiKey,
    baseUrl: input.provider.baseUrl,
    count: input.count,
    deps: input.deps,
    needContent: false,
    oriQuestion: input.oriQuestion,
    query: input.query,
    signal: input.signal,
  });

const fetchPageWithProvider = async (input: {
  deps?: DispatchDeps;
  provider: ResolvedWebProvider;
  signal?: AbortSignal;
  url: string;
}): Promise<WebPageResult> =>
  await fetchDeepSeekPage({
    apiKey: input.provider.apiKey,
    baseUrl: input.provider.baseUrl,
    deps: input.deps,
    signal: input.signal,
    url: input.url,
  });

export { fetchPageWithProvider, searchWithProvider };
