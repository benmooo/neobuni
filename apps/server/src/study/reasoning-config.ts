import {
  getMemoryReasoningProviderConfig,
  getProviderConfig,
  runRepo,
} from "@neobuni/db";

import { toOpenAICompatibleConfig } from "../digest/memory-provider-config";
import type { OpenAICompatibleConfig } from "../providers/openai-compatible-client";

const resolveStudyReasoningConfig = async (
  profileId: string
): Promise<OpenAICompatibleConfig | null> => {
  const [reasoning, chat] = await Promise.all([
    runRepo(getMemoryReasoningProviderConfig(profileId)),
    runRepo(getProviderConfig(profileId)),
  ]);
  return toOpenAICompatibleConfig(reasoning) ?? toOpenAICompatibleConfig(chat);
};

export { resolveStudyReasoningConfig };
