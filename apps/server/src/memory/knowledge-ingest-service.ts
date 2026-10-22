import { extractMemoryKeywords } from "@neobuni/core";
import {
  createKnowledgeChunk as createKnowledgeChunkFx,
  createKnowledgeDocument as createKnowledgeDocumentFx,
  createKnowledgeFacts as createKnowledgeFactsFx,
  findKnowledgeDocumentByChecksum as findKnowledgeDocumentByChecksumFx,
  runRepo,
  upsertKnowledgeChunkEmbedding as upsertKnowledgeChunkEmbeddingFx,
  upsertKnowledgeChunkFts as upsertKnowledgeChunkFtsFx,
} from "@neobuni/db";

const createKnowledgeChunk = (
  ...args: Parameters<typeof createKnowledgeChunkFx>
) => runRepo(createKnowledgeChunkFx(...args));
const createKnowledgeDocument = (
  ...args: Parameters<typeof createKnowledgeDocumentFx>
) => runRepo(createKnowledgeDocumentFx(...args));
const createKnowledgeFacts = (
  ...args: Parameters<typeof createKnowledgeFactsFx>
) => runRepo(createKnowledgeFactsFx(...args));
const findKnowledgeDocumentByChecksum = (
  ...args: Parameters<typeof findKnowledgeDocumentByChecksumFx>
) => runRepo(findKnowledgeDocumentByChecksumFx(...args));
const upsertKnowledgeChunkEmbedding = (
  ...args: Parameters<typeof upsertKnowledgeChunkEmbeddingFx>
) => runRepo(upsertKnowledgeChunkEmbeddingFx(...args));
const upsertKnowledgeChunkFts = (
  ...args: Parameters<typeof upsertKnowledgeChunkFtsFx>
) => runRepo(upsertKnowledgeChunkFtsFx(...args));

import { embedQueryForSearch } from "../digest/embedding-service";
import {
  createChatCompletion,
  type OpenAICompatibleConfig,
} from "../providers/openai-compatible-client";

interface KnowledgeIngestResult {
  chunkCount: number;
  created: boolean;
  documentId: string;
  factCount: number;
}

const FACT_EXTRACTION_PROMPT = `Extract factual triples from the knowledge chunk.

Return a JSON array. Each item must be:
{
  "subject": string,
  "predicate": string,
  "object": string,
  "confidence": number
}

Rules:
- Keep facts atomic.
- Do not invent information.
- If the chunk has no clear factual statements, return [].
- Return valid JSON only.`;

const parseJson = <T>(text: string, fallback: T): T => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};

const unique = <T>(values: T[]) => Array.from(new Set(values));

const estimateTokenCount = (text: string) =>
  Math.max(1, Math.round(text.trim().length / 4));

const splitIntoChunks = (content: string, maxChars = 900) => {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs.length > 0
    ? paragraphs
    : [content.trim()]) {
    if (paragraph.length > maxChars) {
      const sentences = paragraph.split(/(?<=[.!?。！？])\s+/);
      for (const sentence of sentences) {
        if ((current + sentence).length > maxChars && current.length > 0) {
          chunks.push(current.trim());
          current = sentence;
        } else {
          current = `${current} ${sentence}`.trim();
        }
      }
      continue;
    }

    if ((current + paragraph).length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = paragraph;
      continue;
    }

    current = `${current}\n\n${paragraph}`.trim();
  }

  if (current.length > 0) {
    chunks.push(current.trim());
  }

  return chunks.filter((chunk) => chunk.length > 0);
};

const sha256 = async (input: string) => {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
};

const extractFactsForChunk = async (
  reasoningConfig: OpenAICompatibleConfig,
  content: string
) => {
  const response = await createChatCompletion(reasoningConfig, [
    {
      role: "system",
      content: FACT_EXTRACTION_PROMPT,
    },
    {
      role: "user",
      content,
    },
  ]);

  const parsed = parseJson<
    Array<{
      subject?: unknown;
      predicate?: unknown;
      object?: unknown;
      confidence?: unknown;
    }>
  >(response, []);

  return parsed
    .map((item) => ({
      subject: typeof item.subject === "string" ? item.subject.trim() : "",
      predicate:
        typeof item.predicate === "string" ? item.predicate.trim() : "",
      object: typeof item.object === "string" ? item.object.trim() : "",
      confidence:
        typeof item.confidence === "number" && Number.isFinite(item.confidence)
          ? item.confidence
          : 0.7,
    }))
    .filter(
      (item) =>
        item.subject.length > 0 &&
        item.predicate.length > 0 &&
        item.object.length > 0
    );
};

const ingestKnowledgeDocument = async (input: {
  profileId: string | null;
  title: string;
  content: string;
  sourceType: string;
  sourceUri?: string | null;
  scope?: "profile" | "global";
  trustLevel?: "imported" | "curated" | "system";
  embeddingConfig?: OpenAICompatibleConfig | null;
  reasoningConfig?: OpenAICompatibleConfig | null;
}): Promise<KnowledgeIngestResult> => {
  const checksum = await sha256(`${input.title}\n${input.content}`);
  const existing = await findKnowledgeDocumentByChecksum({
    checksum,
    profileId: input.profileId,
  });

  if (existing) {
    return {
      documentId: existing.id,
      created: false,
      chunkCount: 0,
      factCount: 0,
    };
  }

  const document = await createKnowledgeDocument({
    profileId: input.profileId,
    scope: input.scope ?? "profile",
    title: input.title,
    sourceType: input.sourceType,
    sourceUri: input.sourceUri ?? null,
    trustLevel: input.trustLevel ?? "imported",
    checksum,
  });

  const chunks = splitIntoChunks(input.content);
  let factCount = 0;

  for (const [chunkIndex, content] of chunks.entries()) {
    const keywords = unique(extractMemoryKeywords(content)).slice(0, 8);
    const chunk = await createKnowledgeChunk({
      documentId: document.id,
      chunkIndex,
      content,
      keywords,
      tokenCount: estimateTokenCount(content),
    });

    upsertKnowledgeChunkFts({
      chunkId: chunk.id,
      content: chunk.content,
      keywords: chunk.keywords,
    });

    if (input.embeddingConfig) {
      const embedding = await embedQueryForSearch(
        input.embeddingConfig,
        chunk.content
      );
      upsertKnowledgeChunkEmbedding(chunk.id, embedding);
    }

    if (input.reasoningConfig) {
      const facts = await extractFactsForChunk(
        input.reasoningConfig,
        chunk.content
      );
      const createdFacts = await createKnowledgeFacts(
        facts.map((fact) => ({
          documentId: document.id,
          chunkId: chunk.id,
          subject: fact.subject,
          predicate: fact.predicate,
          object: fact.object,
          confidence: fact.confidence,
        }))
      );
      factCount += createdFacts.length;
    }
  }

  return {
    documentId: document.id,
    created: true,
    chunkCount: chunks.length,
    factCount,
  };
};

export type { KnowledgeIngestResult };
export { ingestKnowledgeDocument };
