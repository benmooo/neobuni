import {
  createEmbedding,
  type OpenAICompatibleConfig,
} from "../providers/openai-compatible-client";

const MEMORY_EMBEDDING_DIMENSIONS = 1024;

const embedText = async (
  config: OpenAICompatibleConfig,
  text: string
): Promise<Float32Array> => {
  const values = await createEmbedding(config, text);

  if (values.length !== MEMORY_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${MEMORY_EMBEDDING_DIMENSIONS} embedding dimensions, received ${values.length}`
    );
  }

  return new Float32Array(values);
};

export type { OpenAICompatibleConfig };
export { embedText, MEMORY_EMBEDDING_DIMENSIONS };
