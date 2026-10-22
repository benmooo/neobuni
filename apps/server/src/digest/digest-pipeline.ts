import {
  createMemory as createMemoryFx,
  getDigestAnchor as getDigestAnchorFx,
  listMessages as listMessagesFx,
  runRepo,
  upsertDigestAnchor as upsertDigestAnchorFx,
} from "@neobuni/db";

const createMemory = (...args: Parameters<typeof createMemoryFx>) =>
  runRepo(createMemoryFx(...args));
const getDigestAnchor = (...args: Parameters<typeof getDigestAnchorFx>) =>
  runRepo(getDigestAnchorFx(...args));
const listMessages = (...args: Parameters<typeof listMessagesFx>) =>
  runRepo(listMessagesFx(...args));
const upsertDigestAnchor = (...args: Parameters<typeof upsertDigestAnchorFx>) =>
  runRepo(upsertDigestAnchorFx(...args));

import { projectMemoriesToGraph } from "../memory/graph-projector";
import {
  type RecalledMemory,
  recallMemories,
} from "../memory/temporal-memory-store";
import { embedAndStoreMemory } from "./embedding-service";
import {
  extractMemories,
  type OpenAICompatibleConfig,
  runInstantDigestLLM,
} from "./memory-reasoning-service";

interface DigestResult {
  memoriesCreated: number;
  messagesProcessed: number;
}

interface InstantDigestOutput {
  keywords: string[];
  memories: RecalledMemory[];
  shouldRecall: boolean;
}

const BATCH_SIZE = 20;

const formatMessagesForExtraction = (
  messages: Array<{ role: string; content: string; createdAt: string }>
): string =>
  messages
    .map(
      (m) =>
        `[${m.createdAt}] ${m.role === "user" ? "User" : "AI"}: ${m.content}`
    )
    .join("\n");

const runManualDigest = async (
  profileId: string,
  conversationId: string,
  reasoningConfig: OpenAICompatibleConfig,
  embeddingConfig: OpenAICompatibleConfig
): Promise<DigestResult> => {
  const anchor = await getDigestAnchor(profileId, conversationId);
  const allMessages = await listMessages(conversationId);

  const messagesToProcess = anchor
    ? allMessages.filter((m) => m.createdAt > anchor.lastMessageTs)
    : allMessages;

  if (messagesToProcess.length === 0) {
    return { memoriesCreated: 0, messagesProcessed: 0 };
  }

  let totalCreated = 0;
  const createdMemories: Array<{
    id: string;
    content: string;
    type: "event" | "thought" | "preference" | "fact" | "task";
    keywords: string[];
    unresolved: boolean;
    sourceStartTs: string | null;
    sourceEndTs: string | null;
  }> = [];

  for (let i = 0; i < messagesToProcess.length; i += BATCH_SIZE) {
    const batch = messagesToProcess.slice(i, i + BATCH_SIZE);
    const text = formatMessagesForExtraction(batch);
    const extracted = await extractMemories(reasoningConfig, text);

    const firstTs = batch[0]?.createdAt ?? null;
    const lastTs = batch.at(-1)?.createdAt ?? null;

    for (const mem of extracted) {
      const created = await createMemory(profileId, {
        content: mem.content,
        type: mem.type,
        keywords: mem.keywords,
        importance: mem.importance,
        sourceStartTs: firstTs,
        sourceEndTs: lastTs,
        unresolved: mem.unresolved,
      });

      try {
        await embedAndStoreMemory(embeddingConfig, created.id, created.content);
      } catch (err) {
        console.warn(`Failed to embed memory ${created.id}:`, err);
      }

      createdMemories.push({
        id: created.id,
        content: created.content,
        type: created.type,
        keywords: created.keywords,
        unresolved: created.unresolved,
        sourceStartTs: created.sourceStartTs,
        sourceEndTs: created.sourceEndTs,
      });
      totalCreated++;
    }
  }

  try {
    await projectMemoriesToGraph(profileId, createdMemories);
  } catch (error) {
    console.warn("Failed to project digest memories into graph:", error);
  }

  const lastMsg = messagesToProcess.at(-1);
  if (lastMsg) {
    await upsertDigestAnchor(
      profileId,
      conversationId,
      lastMsg.id,
      lastMsg.createdAt
    );
  }

  return {
    memoriesCreated: totalCreated,
    messagesProcessed: messagesToProcess.length,
  };
};

const runInstantDigest = async (
  profileId: string,
  userMessage: string,
  reasoningConfig: OpenAICompatibleConfig,
  embeddingConfig: OpenAICompatibleConfig
): Promise<InstantDigestOutput> => {
  const result = await runInstantDigestLLM(reasoningConfig, userMessage);

  if (!result.shouldRecall) {
    return { shouldRecall: false, keywords: [], memories: [] };
  }

  const memories = await recallMemories({
    profileId,
    query: userMessage,
    queryKeywords: result.keywords,
    embeddingConfig,
  });

  return {
    shouldRecall: true,
    keywords: result.keywords,
    memories,
  };
};

export type { DigestResult, InstantDigestOutput };
export { runInstantDigest, runManualDigest };
