import {
  type DecisionJevProviderConfigInput,
  decisionJevProviderConfigInputSchema,
} from "@neobuni/contracts";
import { getDecisionJevProviderConfig } from "@neobuni/db";

import { createOpenRouterJevProvider } from "./providers/openrouter-jev-provider";

type JevRuntimeConfig = DecisionJevProviderConfigInput;

const getJevRuntimeConfig = async (
  profileId: string
): Promise<JevRuntimeConfig | null> => {
  const config = await getDecisionJevProviderConfig(profileId);
  if (!config) {
    return null;
  }
  const parsed = decisionJevProviderConfigInputSchema.safeParse(config);
  return parsed.success ? parsed.data : null;
};

const getConfiguredJevProvider = async (profileId: string) => {
  const config = await getJevRuntimeConfig(profileId);
  if (!config?.enabled) {
    return null;
  }
  return createOpenRouterJevProvider({
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
    timeoutMs: config.metadata.timeoutMs,
    maxRetries: config.metadata.maxRetries,
  });
};

export type { JevRuntimeConfig };
export { getConfiguredJevProvider, getJevRuntimeConfig };
