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
import { parseChunkLocator } from "./knowledge-locator";

interface KnowledgeSearchItem {
  chapter: string | null;
  chunkId: string;
  chunkIndex: number;
  documentId: string;
  documentTitle: string;
  keywords: string[];
  locator: string | null;
  page: number | null;
  pageEnd: number | null;
  score: number;
  text: string;
  tokenCount: number;
}

interface KnowledgeSearchStats {
  keywordHitCount: number;
  returnedItemCount: number;
  vectorHitCount: number;
}

interface KnowledgeSearchResult {
  items: KnowledgeSearchItem[];
  stats: KnowledgeSearchStats;
  store: "knowledge";
}

interface KnowledgeRecallResult {
  items: EvidenceItem[];
  stats: KnowledgeSearchStats;
  store: "knowledge";
}

const unique = <T>(values: T[]) => Array.from(new Set(values));

const stripLocator = (content: string, hasLocator: boolean) =>
  hasLocator ? content.split("\n").slice(1).join("\n").trim() : content.trim();

/**
 * Hybrid keyword + vector search over the chunks the profile can see.
 *
 * Shared by turn pre-recall and the chat `search_knowledge` tool so both return
 * the same citations.
 */
const searchKnowledge = async (input: {
  documentTitle?: string;
  embeddingConfig?: OpenAICompatibleConfig | null;
  keywords?: string[];
  limit: number;
  profileId: string;
  query: string;
}): Promise<KnowledgeSearchResult> => {
  const matchQuery = unique(input.keywords ?? []).join(" OR ") || input.query;
  const keywordHits = await searchKnowledgeChunkText(
    matchQuery,
    input.limit * 3
  );
  const fallbackHits =
    keywordHits.length > 0
      ? []
      : await searchKnowledgeChunkTextFallback({
          profileId: input.profileId,
          query: input.query,
          keywords: input.keywords ?? [],
          limit: input.limit * 3,
        });

  const queryEmbedding =
    input.embeddingConfig && input.query.trim().length > 0
      ? await embedQueryForSearch(input.embeddingConfig, input.query)
      : null;
  const vectorHits = queryEmbedding
    ? await searchSimilarKnowledgeChunks(queryEmbedding, input.limit * 3)
    : [];
  const candidateChunkIds = unique([
    ...keywordHits.map((hit) => hit.chunkId),
    ...fallbackHits.map((hit) => hit.chunkId),
    ...vectorHits.map((hit) => hit.chunkId),
  ]);
  const chunks = await getKnowledgeChunksByIds(candidateChunkIds);
  const keywordScoreMap = new Map<string, number>();
  const vectorScoreMap = new Map<string, number>();

  for (const hit of keywordHits) {
    keywordScoreMap.set(
      hit.chunkId,
      Math.max(keywordScoreMap.get(hit.chunkId) ?? 0, hit.score)
    );
  }

  for (const hit of fallbackHits) {
    keywordScoreMap.set(
      hit.chunkId,
      Math.max(keywordScoreMap.get(hit.chunkId) ?? 0, hit.score)
    );
  }

  for (const hit of vectorHits) {
    const similarity = distanceToSimilarity(hit.distance);
    vectorScoreMap.set(
      hit.chunkId,
      Math.max(vectorScoreMap.get(hit.chunkId) ?? 0, similarity * 0.92)
    );
  }

  const titleFilter = input.documentTitle?.trim().toLowerCase();
  const allowedChunks = chunks
    .filter(
      (chunk) =>
        chunk.document.status === "active" &&
        (chunk.document.profileId === input.profileId ||
          chunk.document.profileId === null ||
          chunk.document.scope === "global") &&
        (!titleFilter ||
          chunk.document.title.toLowerCase().includes(titleFilter))
    )
    .map((chunk) => {
      const vectorScore = vectorScoreMap.get(chunk.id) ?? 0;
      const keywordScore = keywordScoreMap.get(chunk.id) ?? 0;

      // Chinese FTS is noisy, so semantic hits win when embeddings are
      // available; keyword-only hits are down-weighted but still fill slots.
      return {
        ...chunk,
        hybridScore: Math.max(vectorScore, keywordScore * 0.5),
      };
    })
    .filter((chunk) => chunk.hybridScore > 0)
    .sort((left, right) => right.hybridScore - left.hybridScore)
    .slice(0, input.limit);

  const items: KnowledgeSearchItem[] = allowedChunks.map((chunk) => {
    const locator = parseChunkLocator(chunk.content);

    return {
      chapter: locator?.chapter ?? null,
      chunkId: chunk.id,
      chunkIndex: chunk.chunkIndex,
      documentId: chunk.document.id,
      documentTitle: chunk.document.title,
      keywords: chunk.keywords,
      locator: locator?.locator ?? null,
      page: locator?.page ?? null,
      pageEnd: locator?.pageEnd ?? null,
      score: chunk.hybridScore,
      text: stripLocator(chunk.content, locator !== null),
      tokenCount: chunk.tokenCount,
    };
  });

  return {
    items,
    stats: {
      keywordHitCount: keywordHits.length + fallbackHits.length,
      returnedItemCount: items.length,
      vectorHitCount: vectorHits.length,
    },
    store: "knowledge",
  };
};

const recallKnowledge = async (input: {
  profileId: string;
  plan: RetrievalPlan;
  embeddingConfig?: OpenAICompatibleConfig | null;
}): Promise<KnowledgeRecallResult | null> => {
  const query = input.plan.queries.knowledge;

  if (!query) {
    return null;
  }

  const searched = await searchKnowledge({
    embeddingConfig: input.embeddingConfig,
    keywords: query.keywords,
    limit: query.limit,
    profileId: input.profileId,
    query: query.query,
  });

  const chunkItems: EvidenceItem[] = searched.items.map((item) => ({
    id: `knowledge-chunk-${item.chunkId}`,
    store: "knowledge",
    kind: "chunk",
    title: item.documentTitle,
    content: item.text,
    score: 0.5 + Math.min(item.score, 1) * 0.42,
    confidence: Math.min(item.score, 1),
    recency: null,
    retrievalReason: input.plan.reasons.includes("world_knowledge")
      ? "world_knowledge"
      : (input.plan.reasons[0] ?? "hybrid"),
    provenance: {
      sourceType: "knowledge_chunk",
      sourceId: item.chunkId,
      citationLabel: item.documentTitle,
    },
    metadata: {
      documentId: item.documentId,
      documentTitle: item.documentTitle,
      chunkIndex: item.chunkIndex,
      tokenCount: item.tokenCount,
      keywords: item.keywords,
    },
  }));

  const facts = await searchKnowledgeFacts({
    profileId: input.profileId,
    terms: unique([query.query, ...query.keywords]),
    limit: query.limit,
  });

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
    items,
    stats: searched.stats,
    store: "knowledge",
  };
};

export type {
  KnowledgeRecallResult,
  KnowledgeSearchItem,
  KnowledgeSearchResult,
  KnowledgeSearchStats,
};
export { recallKnowledge, searchKnowledge };
