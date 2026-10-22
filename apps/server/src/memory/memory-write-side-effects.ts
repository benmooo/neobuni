import {
  deleteMemoryEmbedding as deleteMemoryEmbeddingFx,
  runRepo,
} from "@neobuni/db";

const deleteMemoryEmbedding = (
  ...args: Parameters<typeof deleteMemoryEmbeddingFx>
) => runRepo(deleteMemoryEmbeddingFx(...args));

import type { MemoryStatus } from "@neobuni/contracts";

import { embedAndStoreMemory } from "../digest/embedding-service";
import type { OpenAICompatibleConfig } from "../digest/memory-embedding-service";

const syncMemoryEmbedding = async (input: {
  embeddingConfig: OpenAICompatibleConfig | null;
  memoryId: string;
  content: string;
  status: MemoryStatus;
}) => {
  if (!input.embeddingConfig) {
    return;
  }

  if (input.status !== "active") {
    try {
      deleteMemoryEmbedding(input.memoryId);
    } catch {
      // vec row may not exist yet
    }
    return;
  }

  await embedAndStoreMemory(
    input.embeddingConfig,
    input.memoryId,
    input.content
  );
};

export { syncMemoryEmbedding };
