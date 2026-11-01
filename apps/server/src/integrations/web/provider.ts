import {
  getMemoryReasoningProviderConfig as getMemoryReasoningProviderConfigFx,
  getWebSearchProviderConfig as getWebSearchProviderConfigFx,
  runRepo,
} from "@neobuni/db";

import { DEFAULT_DEEPSEEK_BASE_URL } from "./deepseek-search";
import { readWebclawConfig } from "./webclaw";

const getMemoryReasoningProviderConfig = (
  ...args: Parameters<typeof getMemoryReasoningProviderConfigFx>
) => runRepo(getMemoryReasoningProviderConfigFx(...args));
const getWebSearchProviderConfig = (
  ...args: Parameters<typeof getWebSearchProviderConfigFx>
) => runRepo(getWebSearchProviderConfigFx(...args));

interface ResolvedDeepSeekProvider {
  apiKey: string;
  baseUrl: string;
  kind: "deepseek";
}

interface ResolvedWebclawProvider {
  apiKey: string;
  baseUrl: string;
  kind: "webclaw";
}

type ResolvedWebProvider = ResolvedDeepSeekProvider | ResolvedWebclawProvider;

interface WebProviderDeps {
  getMemoryReasoningProviderConfig: typeof getMemoryReasoningProviderConfig;
  getWebSearchProviderConfig: typeof getWebSearchProviderConfig;
  readWebclawConfig: typeof readWebclawConfig;
}

const defaultDeps: WebProviderDeps = {
  getMemoryReasoningProviderConfig,
  getWebSearchProviderConfig,
  readWebclawConfig,
};

const isDeepSeekHost = (baseUrl: string): boolean => {
  try {
    return new URL(baseUrl).hostname.endsWith("deepseek.com");
  } catch {
    return false;
  }
};

/**
 * Picks the search backend for a profile.
 *
 * The dedicated `web_search` slot wins when present: search and inference are
 * separate purposes and separate bills, so an explicitly configured (or
 * explicitly disabled) search key is authoritative. Only profiles that never
 * configured the slot keep the legacy behaviour of reusing a DeepSeek reasoning
 * key, and then fall back to the Webclaw environment key.
 */
const resolveWebProvider = async (
  profileId: string,
  overrides: Partial<WebProviderDeps> = {}
): Promise<ResolvedWebProvider | null> => {
  const deps: WebProviderDeps = { ...defaultDeps, ...overrides };

  const webSearch = await deps
    .getWebSearchProviderConfig(profileId)
    .catch(() => null);

  if (webSearch) {
    const apiKey = webSearch.apiKey.trim();

    if (!webSearch.enabled || apiKey.length === 0) {
      return null;
    }

    if (webSearch.provider === "deepseek") {
      const baseUrl = webSearch.baseUrl.trim();

      return {
        apiKey,
        baseUrl: baseUrl.length > 0 ? baseUrl : DEFAULT_DEEPSEEK_BASE_URL,
        kind: "deepseek",
      };
    }

    return null;
  }

  const reasoning = await deps
    .getMemoryReasoningProviderConfig(profileId)
    .catch(() => null);
  const apiKey = reasoning?.apiKey?.trim() ?? "";
  const baseUrl = reasoning?.baseUrl?.trim() ?? "";

  if (
    apiKey.length > 0 &&
    (reasoning?.provider === "deepseek" ||
      isDeepSeekHost(baseUrl.length > 0 ? baseUrl : DEFAULT_DEEPSEEK_BASE_URL))
  ) {
    return {
      apiKey,
      baseUrl: baseUrl.length > 0 ? baseUrl : DEFAULT_DEEPSEEK_BASE_URL,
      kind: "deepseek",
    };
  }

  const webclaw = deps.readWebclawConfig();

  if (webclaw.apiKey.length > 0) {
    return {
      apiKey: webclaw.apiKey,
      baseUrl: webclaw.baseUrl,
      kind: "webclaw",
    };
  }

  return null;
};

export type {
  ResolvedDeepSeekProvider,
  ResolvedWebclawProvider,
  ResolvedWebProvider,
  WebProviderDeps,
};
export { isDeepSeekHost, resolveWebProvider };
