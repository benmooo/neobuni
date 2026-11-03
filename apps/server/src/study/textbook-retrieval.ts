import type { StudyMaterialExcerpt } from "@neobuni/contracts";
import { textbookChaptersForTopics } from "@neobuni/core";
import {
  getKnowledgeChunksByIds,
  getMemoryEmbeddingProviderConfig,
  runRepo,
  searchKnowledgeChunkTextFallback,
  searchSimilarKnowledgeChunks,
} from "@neobuni/db";
import { embedQueryForSearch } from "../digest/embedding-service";
import { toOpenAICompatibleConfig } from "../digest/memory-provider-config";
import { parseChunkLocator } from "../memory/knowledge-locator";

const MAX_EXCERPT_CHARS = 1200;
const MAX_EXCERPTS = 6;
const VECTOR_CANDIDATES = 80;
const KEYWORD_CANDIDATES = 40;

interface RetrievedExcerpt {
  chapter: string;
  chunkId: string;
  locator: string;
  page: number;
  pageEnd: number | null;
  text: string;
}

const toExcerpt = (chunk: {
  id: string;
  content: string;
}): RetrievedExcerpt | null => {
  const parsed = parseChunkLocator(chunk.content);
  if (!parsed) {
    return null;
  }

  const text = chunk.content
    .split("\n")
    .slice(1)
    .join("\n")
    .trim()
    .slice(0, MAX_EXCERPT_CHARS);

  if (text.length < 40) {
    return null;
  }

  return { ...parsed, chunkId: chunk.id, text };
};

const chaptersOf = (chapterLabel: string): number | null => {
  const match = /^第(\d+)章/.exec(chapterLabel);
  return match ? Number(match[1]) : null;
};

const inChapters = (
  excerpt: RetrievedExcerpt,
  chapterNumbers: number[]
): boolean => {
  if (chapterNumbers.length === 0) {
    return true;
  }
  const chapter = chaptersOf(excerpt.chapter);
  return chapter !== null && chapterNumbers.includes(chapter);
};

const uniqueByPage = (
  excerpts: RetrievedExcerpt[],
  limit: number
): RetrievedExcerpt[] => {
  const seen = new Set<number>();
  const result: RetrievedExcerpt[] = [];

  for (const excerpt of excerpts) {
    if (seen.has(excerpt.page)) {
      continue;
    }
    seen.add(excerpt.page);
    result.push(excerpt);
    if (result.length >= limit) {
      break;
    }
  }

  return result;
};

/**
 * Retrieves textbook excerpts for a lesson: vector search when an embedding
 * provider is configured, keyword fallback otherwise, always filtered to the
 * chapters mapped to the lesson's syllabus topics.
 */
const retrieveTextbookExcerpts = async (input: {
  limit?: number;
  profileId: string;
  query: string;
  topicIds: string[];
}): Promise<RetrievedExcerpt[]> => {
  const limit = input.limit ?? MAX_EXCERPTS;
  const chapterNumbers = textbookChaptersForTopics(input.topicIds);
  const embeddingConfig = toOpenAICompatibleConfig(
    await runRepo(getMemoryEmbeddingProviderConfig(input.profileId))
  );

  let chunkIds: string[] = [];

  if (embeddingConfig) {
    try {
      const vector = await embedQueryForSearch(embeddingConfig, input.query);
      const hits = await runRepo(
        searchSimilarKnowledgeChunks(vector, VECTOR_CANDIDATES)
      );
      chunkIds = hits.map((hit) => hit.chunkId);
    } catch {
      chunkIds = [];
    }
  }

  if (chunkIds.length === 0) {
    const hits = await runRepo(
      searchKnowledgeChunkTextFallback({
        keywords: input.query.split(/\s+/).filter(Boolean),
        limit: KEYWORD_CANDIDATES,
        profileId: input.profileId,
        query: input.query,
      })
    );
    chunkIds = hits.map((hit) => hit.chunkId);
  }

  if (chunkIds.length === 0) {
    return [];
  }

  const chunks = await runRepo(getKnowledgeChunksByIds(chunkIds));
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const ordered = chunkIds
    .flatMap((chunkId) => {
      const chunk = byId.get(chunkId);
      return chunk ? [toExcerpt(chunk)] : [];
    })
    .flatMap((excerpt) => (excerpt ? [excerpt] : []))
    .filter((excerpt) => inChapters(excerpt, chapterNumbers));

  return uniqueByPage(ordered, limit);
};

const toMaterialExcerpts = (
  excerpts: RetrievedExcerpt[]
): StudyMaterialExcerpt[] =>
  excerpts.map((excerpt) => ({
    chapter: excerpt.chapter,
    locator: excerpt.locator,
    page: excerpt.page,
    pageEnd: excerpt.pageEnd,
    text: excerpt.text,
  }));

export type { RetrievedExcerpt };
export { retrieveTextbookExcerpts, toMaterialExcerpts };
