import {
	runRepo,
	upsertMemoryEmbedding as upsertMemoryEmbeddingFx,
} from "@neobuni/db";

const upsertMemoryEmbedding = (
	...args: Parameters<typeof upsertMemoryEmbeddingFx>
) => runRepo(upsertMemoryEmbeddingFx(...args));

import {
	embedText,
	type OpenAICompatibleConfig,
} from "./memory-embedding-service";

const embedAndStoreMemory = async (
	config: OpenAICompatibleConfig,
	memoryId: string,
	content: string
): Promise<void> => {
	const embedding = await embedText(config, content);
	upsertMemoryEmbedding(memoryId, embedding);
};

const embedQueryForSearch = async (
	config: OpenAICompatibleConfig,
	query: string
): Promise<Float32Array> => embedText(config, query);

export { embedAndStoreMemory, embedQueryForSearch };
