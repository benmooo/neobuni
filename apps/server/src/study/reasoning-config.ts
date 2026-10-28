import {
  getMemoryReasoningProviderConfig,
  getProviderConfig,
  runRepo,
} from "@neobuni/db";

import { toOpenAICompatibleConfig } from "../digest/memory-provider-config";
import type { OpenAICompatibleConfig } from "../providers/openai-compatible-client";
import { buildOpenCodeHeaders } from "../providers/opencode";

type ProviderConfigRecord = Parameters<typeof toOpenAICompatibleConfig>[0];

const buildStudySessionId = (profileId: string) => `study:${profileId}`;

const toStudyConfig = (
  config: ProviderConfigRecord,
  profileId: string
): OpenAICompatibleConfig | null => {
  const base = toOpenAICompatibleConfig(config);

  if (!base) {
    return null;
  }

  // OpenCode asks every non-OpenCode client to identify itself and to send a
  // stable session id, which also lets their prompt cache do its job across the
  // enrichment and grading calls for the same learner.
  if (config?.provider === "opencode") {
    return {
      ...base,
      headers: buildOpenCodeHeaders({
        sessionId: buildStudySessionId(profileId),
      }),
    };
  }

  return base;
};

const resolveStudyReasoningConfig = async (
  profileId: string
): Promise<OpenAICompatibleConfig | null> => {
  const [reasoning, chat] = await Promise.all([
    runRepo(getMemoryReasoningProviderConfig(profileId)),
    runRepo(getProviderConfig(profileId)),
  ]);
  return toStudyConfig(reasoning, profileId) ?? toStudyConfig(chat, profileId);
};

export { resolveStudyReasoningConfig };
