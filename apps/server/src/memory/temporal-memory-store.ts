import {
  computeMemoryScore,
  distanceToSimilarity,
  type MemoryEntry,
  rankMemories,
  type ScoredMemory,
  surfaceMemories,
} from "@neobuni/core";
import {
  getMemoriesByIdsWithStatuses as getMemoriesByIdsWithStatusesFx,
  listRecentMemories as listRecentMemoriesFx,
  listUnresolvedMemories as listUnresolvedMemoriesFx,
  runRepo,
  searchSimilarMemories as searchSimilarMemoriesFx,
} from "@neobuni/db";

const getMemoriesByIdsWithStatuses = (
  ...args: Parameters<typeof getMemoriesByIdsWithStatusesFx>
) => runRepo(getMemoriesByIdsWithStatusesFx(...args));
const listRecentMemories = (...args: Parameters<typeof listRecentMemoriesFx>) =>
  runRepo(listRecentMemoriesFx(...args));
const listUnresolvedMemories = (
  ...args: Parameters<typeof listUnresolvedMemoriesFx>
) => runRepo(listUnresolvedMemoriesFx(...args));
const searchSimilarMemories = (
  ...args: Parameters<typeof searchSimilarMemoriesFx>
) => runRepo(searchSimilarMemoriesFx(...args));

import { embedQueryForSearch } from "../digest/embedding-service";
import type { OpenAICompatibleConfig } from "../digest/memory-embedding-service";

interface RecallInput {
  embeddingConfig: OpenAICompatibleConfig;
  limit?: number;
  profileId: string;
  query: string;
  queryKeywords: string[];
}

interface RecalledMemory {
  content: string;
  id: string;
  importance: number;
  keywords: string[];
  similarity: number;
  sourceTier: "vector_hit" | "unresolved_carryover" | "recent_continuity";
  type: string;
}

const recallMemories = async ({
  profileId,
  query,
  queryKeywords,
  embeddingConfig,
  limit = 5,
}: RecallInput): Promise<RecalledMemory[]> => {
  const queryEmbedding = await embedQueryForSearch(embeddingConfig, query);
  const candidates = await searchSimilarMemories(queryEmbedding, 20);

  if (candidates.length === 0) {
    return [];
  }

  const memoryIds = candidates.map((candidate) => candidate.memoryId);
  const fullMemories = await getMemoriesByIdsWithStatuses(memoryIds, {
    status: "active",
  });
  const distanceMap = new Map(
    candidates.map((candidate) => [candidate.memoryId, candidate.distance])
  );

  const scored: ScoredMemory[] = fullMemories.map((memory) => {
    const distance = distanceMap.get(memory.id) ?? Number.POSITIVE_INFINITY;
    const vectorSimilarity = distanceToSimilarity(distance);
    const keywordScore =
      queryKeywords.length > 0
        ? queryKeywords.filter((keyword) =>
            memory.keywords.some(
              (memoryKeyword) =>
                memoryKeyword.toLowerCase() === keyword.toLowerCase()
            )
          ).length / queryKeywords.length
        : 0;

    return {
      memoryId: memory.id,
      vectorSimilarity,
      keywordScore,
      importance: memory.importance,
      finalScore: computeMemoryScore({
        vectorDistance: distance,
        queryKeywords,
        memoryKeywords: memory.keywords,
        importance: memory.importance,
      }),
    };
  });

  const ranked = rankMemories(scored, 0.45, limit);

  const toEntry = (
    memory: (typeof fullMemories)[number],
    similarity?: number
  ): MemoryEntry => ({
    id: memory.id,
    content: memory.content,
    type: memory.type,
    keywords: memory.keywords,
    importance: memory.importance,
    unresolved: memory.unresolved,
    createdAt: memory.createdAt,
    similarity,
  });

  const scoredEntries = ranked
    .map((rankedMemory) => {
      const memory = fullMemories.find(
        (item) => item.id === rankedMemory.memoryId
      );
      return memory ? toEntry(memory, rankedMemory.vectorSimilarity) : null;
    })
    .filter((entry): entry is MemoryEntry => entry !== null);

  const unresolvedMemories = (await listUnresolvedMemories(profileId, 2)).map(
    (memory) => toEntry(memory)
  );
  const recentMemories = (await listRecentMemories(profileId, 3, 8)).map(
    (memory) => toEntry(memory)
  );

  const { memories, tiers } = surfaceMemories(
    scoredEntries,
    unresolvedMemories,
    recentMemories
  );

  const sourceTierEntries: Array<
    readonly [string, RecalledMemory["sourceTier"]]
  > = [
    ...tiers.topicRelated.map((id) => [id, "vector_hit"] as const),
    ...tiers.unresolved.map((id) => [id, "unresolved_carryover"] as const),
    ...tiers.recent.map((id) => [id, "recent_continuity"] as const),
  ];
  const sourceTierById = new Map<string, RecalledMemory["sourceTier"]>(
    sourceTierEntries
  );

  return memories.map((memory) => ({
    id: memory.id,
    content: memory.content,
    type: memory.type,
    keywords: memory.keywords,
    importance: memory.importance,
    similarity: memory.similarity ?? 0,
    sourceTier: sourceTierById.get(memory.id) ?? "vector_hit",
  }));
};

export type { RecalledMemory, RecallInput };
export { recallMemories };
