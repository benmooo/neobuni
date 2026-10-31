import {
  getMemoryReasoningProviderConfig as getMemoryReasoningProviderConfigFx,
  runRepo,
} from "@neobuni/db";

import { DEFAULT_DEEPSEEK_BASE_URL } from "./deepseek-search";
import { readWebclawConfig } from "./webclaw";

const getMemoryReasoningProviderConfig = (
  ...args: Parameters<typeof getMemoryReasoningProviderConfigFx>
) => runRepo(getMemoryReasoningProviderConfigFx(...args));

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
  readWebclawConfig: typeof readWebclawConfig;
}

const isDeepSeekHost = (baseUrl: string): boolean => {
  try {
    return new URL(baseUrl).hostname.endsWith("deepseek.com");
  } catch {
    return false;
  }
};

/**
 * Picks the search backend for a profile: the reasoning provider's DeepSeek key
 * when available (no extra configuration), the Webclaw key as a fallback, or
 * `null` when neither is configured so callers can disable the feature quietly.
 */
const resolveWebProvider = async (
  profileId: string,
  deps: WebProviderDeps = {
    getMemoryReasoningProviderConfig,
    readWebclawConfig,
  }
): Promise<ResolvedWebProvider | null> => {
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
