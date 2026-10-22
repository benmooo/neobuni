import type { EvidenceItem, RetrievalPlan } from "@neobuni/contracts";
import { distanceToSimilarity } from "@neobuni/core";
import {
  getKnowledgeChunksByIds as getKnowledgeChunksByIdsFx,
  runRepo,
  searchKnowledgeChunkTextFallback as searchKnowledgeChunkTextFallbackFx,
  searchKnowledgeChunkText as searchKnowledgeChunkTextFx,
  searchKnowledgeFacts as searchKnowledgeFactsFx,
  searchSimilarKnowledgeChunks as searchSimilarKnowledgeChunksFx,
} from "@neobuni/db";

const getKnowledgeChunksByIds = (
  ...args: Parameters<typeof getKnowledgeChunksByIdsFx>
) => runRepo(getKnowledgeChunksByIdsFx(...args));
const searchKnowledgeChunkText = (
  ...args: Parameters<typeof searchKnowledgeChunkTextFx>
) => runRepo(searchKnowledgeChunkTextFx(...args));
const searchKnowledgeChunkTextFallback = (
  ...args: Parameters<typeof searchKnowledgeChunkTextFallbackFx>
) => runRepo(searchKnowledgeChunkTextFallbackFx(...args));
const searchKnowledgeFacts = (
  ...args: Parameters<typeof searchKnowledgeFactsFx>
) => runRepo(searchKnowledgeFactsFx(...args));
const searchSimilarKnowledgeChunks = (
  ...args: Parameters<typeof searchSimilarKnowledgeChunksFx>
) => runRepo(searchSimilarKnowledgeChunksFx(...args));

import { embedQueryForSearch } from "../digest/embedding-service";
import type { OpenAICompatibleConfig } from "../providers/openai-compatible-client";

interface KnowledgeRecallResult {
  items: EvidenceItem[];
  stats: {
    keywordHitCount: number;
    vectorHitCount: number;
    returnedItemCount: number;
  };
  store: "knowledge";
}

const unique = <T>(values: T[]) => Array.from(new Set(values));

const recallKnowledge = async (input: {
  profileId: string;
  plan: RetrievalPlan;
  embeddingConfig?: OpenAICompatibleConfig | null;
}): Promise<KnowledgeRecallResult | null> => {
  const query = input.plan.queries.knowledge;

  if (!query) {
    return null;
  }

  const matchQuery = unique(query.keywords).join(" OR ") || query.query;
  const keywordHits = await searchKnowledgeChunkText(
    matchQuery,
    query.limit * 3
  );
  const fallbackHits =
    keywordHits.length > 0
      ? []
      : await searchKnowledgeChunkTextFallback({
          profileId: input.profileId,
          query: query.query,
          keywords: query.keywords,
          limit: query.limit * 3,
        });

  const queryEmbedding =
    input.embeddingConfig && query.query.trim().length > 0
      ? await embedQueryForSearch(input.embeddingConfig, query.query)
      : null;
  const vectorHits = queryEmbedding
    ? await searchSimilarKnowledgeChunks(queryEmbedding, query.limit * 3)
    : [];
  const candidateChunkIds = unique([
    ...keywordHits.map((hit) => hit.chunkId),
    ...fallbackHits.map((hit) => hit.chunkId),
    ...vectorHits.map((hit) => hit.chunkId),
  ]);
  const chunks = await getKnowledgeChunksByIds(candidateChunkIds);
  const chunkScoreMap = new Map<string, number>();

  for (const hit of keywordHits) {
    chunkScoreMap.set(
      hit.chunkId,
      Math.max(chunkScoreMap.get(hit.chunkId) ?? 0, hit.score)
    );
  }

  for (const hit of fallbackHits) {
    chunkScoreMap.set(
      hit.chunkId,
      Math.max(chunkScoreMap.get(hit.chunkId) ?? 0, hit.score)
    );
  }

  for (const hit of vectorHits) {
    const similarity = distanceToSimilarity(hit.distance);
    chunkScoreMap.set(
      hit.chunkId,
      Math.max(chunkScoreMap.get(hit.chunkId) ?? 0, similarity * 0.92)
    );
  }

  const allowedChunks = chunks
    .filter(
      (chunk) =>
        chunk.document.status === "active" &&
        (chunk.document.profileId === input.profileId ||
          chunk.document.profileId === null ||
          chunk.document.scope === "global")
    )
    .map((chunk) => ({
      ...chunk,
      hybridScore: chunkScoreMap.get(chunk.id) ?? 0,
    }))
    .filter((chunk) => chunk.hybridScore > 0)
    .sort((left, right) => right.hybridScore - left.hybridScore)
    .slice(0, query.limit);

  const facts = await searchKnowledgeFacts({
    profileId: input.profileId,
    terms: unique([query.query, ...query.keywords]),
    limit: query.limit,
  });

  const chunkItems: EvidenceItem[] = allowedChunks.map((chunk) => ({
    id: `knowledge-chunk-${chunk.id}`,
    store: "knowledge",
    kind: "chunk",
    title: chunk.document.title,
    content: chunk.content,
    score: 0.5 + Math.min(chunk.hybridScore, 1) * 0.42,
    confidence: Math.min(chunk.hybridScore, 1),
    recency: null,
    retrievalReason: input.plan.reasons.includes("world_knowledge")
      ? "world_knowledge"
      : (input.plan.reasons[0] ?? "hybrid"),
    provenance: {
      sourceType: "knowledge_chunk",
      sourceId: chunk.id,
      citationLabel: chunk.document.title,
    },
    metadata: {
      documentId: chunk.document.id,
      documentTitle: chunk.document.title,
      chunkIndex: chunk.chunkIndex,
      tokenCount: chunk.tokenCount,
      keywords: chunk.keywords,
    },
  }));

  const factItems: EvidenceItem[] = facts.map((fact) => ({
    id: `knowledge-fact-${fact.id}`,
    store: "knowledge",
    kind: "fact",
    title: fact.document.title,
    content: `${fact.subject} ${fact.predicate} ${fact.object}`,
    score: 0.56 + Math.min(fact.confidence, 1) * 0.3,
    confidence: fact.confidence,
    recency: null,
    retrievalReason: "world_knowledge",
    provenance: {
      sourceType: "document",
      sourceId: fact.document.id,
      citationLabel: fact.document.title,
    },
    metadata: {
      factId: fact.id,
      documentId: fact.document.id,
      chunkId: fact.chunkId,
      subject: fact.subject,
      predicate: fact.predicate,
      object: fact.object,
    },
  }));

  const items = [...factItems, ...chunkItems]
    .sort((left, right) => right.score - left.score)
    .slice(0, query.limit);

  return {
    store: "knowledge",
    items,
    stats: {
      keywordHitCount: keywordHits.length + fallbackHits.length,
      vectorHitCount: vectorHits.length,
      returnedItemCount: items.length,
    },
  };
};

export type { KnowledgeRecallResult };
export { recallKnowledge };
