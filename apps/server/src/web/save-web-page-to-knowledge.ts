import {
  getMemoryEmbeddingProviderConfig as getMemoryEmbeddingProviderConfigFx,
  getMemoryReasoningProviderConfig as getMemoryReasoningProviderConfigFx,
  runRepo,
} from "@neobuni/db";

const getMemoryEmbeddingProviderConfig = (
  ...args: Parameters<typeof getMemoryEmbeddingProviderConfigFx>
) => runRepo(getMemoryEmbeddingProviderConfigFx(...args));
const getMemoryReasoningProviderConfig = (
  ...args: Parameters<typeof getMemoryReasoningProviderConfigFx>
) => runRepo(getMemoryReasoningProviderConfigFx(...args));

import { toOpenAICompatibleConfig } from "../digest/memory-provider-config";
import type { WebPageDocument } from "../integrations/web/types";
import { ingestKnowledgeDocument } from "../memory/knowledge-ingest-service";

const chooseKnowledgeContent = (document: WebPageDocument) =>
  document.markdown.trim().length > 0 ? document.markdown : document.plainText;

const saveWebPageToKnowledge = async (input: {
  profileId: string;
  url: string;
  title?: string;
  trustLevel: "imported" | "curated";
  document: WebPageDocument;
}) => {
  const [embeddingConfig, reasoningConfig] = await Promise.all([
    getMemoryEmbeddingProviderConfig(input.profileId),
    getMemoryReasoningProviderConfig(input.profileId),
  ]);

  return ingestKnowledgeDocument({
    profileId: input.profileId,
    title: input.title ?? input.document.title ?? input.url,
    content: chooseKnowledgeContent(input.document),
    sourceType: "web",
    sourceUri: input.document.finalUrl,
    trustLevel: input.trustLevel,
    scope: "profile",
    embeddingConfig: toOpenAICompatibleConfig(embeddingConfig),
    reasoningConfig: toOpenAICompatibleConfig(reasoningConfig),
  });
};

export { chooseKnowledgeContent, saveWebPageToKnowledge };
