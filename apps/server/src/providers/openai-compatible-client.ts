import { z } from "zod";

const openAICompatibleConfigSchema = z.object({
  apiKey: z.string().trim().min(1),
  model: z.string().trim().min(1),
  baseUrl: z.string().trim().url().optional(),
  dimensions: z.number().int().positive().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

type OpenAICompatibleConfig = z.infer<typeof openAICompatibleConfigSchema>;

interface OpenAICompatibleMessage {
  content: string;
  role: "system" | "user" | "assistant";
}

interface OpenAICompatibleChatOptions {
  maxTokens?: number;
  signal?: AbortSignal;
  stream?: boolean;
  temperature?: number;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

const normalizeBaseUrl = (baseUrl?: string): string =>
  (baseUrl && baseUrl.trim().length > 0 ? baseUrl : DEFAULT_BASE_URL).replace(
    /\/+$/,
    ""
  );

class OpenAICompatibleRequestError extends Error {
  readonly status: number;

  constructor(status: number, body: string) {
    super(`OpenAI-compatible request failed (${status}): ${body}`);
    this.name = "OpenAICompatibleRequestError";
    this.status = status;
  }
}

/**
 * Some gateway models only accept a single temperature value (Kimi on OpenCode
 * rejects anything but 1). Detect that by inspecting the rejection rather than
 * hardcoding per-model rules that go stale.
 */
const isTemperatureRejection = (error: unknown): boolean =>
  error instanceof OpenAICompatibleRequestError &&
  error.status === 400 &&
  /temperature/i.test(error.message);

const postJson = async <TResponse>(
  config: OpenAICompatibleConfig,
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<TResponse> => {
  const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...config.headers,
    },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    throw new OpenAICompatibleRequestError(
      response.status,
      await response.text()
    );
  }

  return (await response.json()) as TResponse;
};

const readMessageContent = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }
        return "";
      })
      .join("");
  }

  return "";
};

const createEmbedding = async (
  config: OpenAICompatibleConfig,
  input: string
): Promise<number[]> => {
  const parsedConfig = openAICompatibleConfigSchema.parse(config);
  const response = await postJson<{
    data?: Array<{ embedding?: number[] }>;
  }>(parsedConfig, "/embeddings", {
    model: parsedConfig.model,
    input,
    encoding_format: "float",
    ...(parsedConfig.dimensions === undefined
      ? {}
      : { dimensions: parsedConfig.dimensions }),
  });

  const embedding = response.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error("No embedding returned from OpenAI-compatible API");
  }

  return embedding;
};

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
}

const buildChatCompletionBody = (input: {
  config: OpenAICompatibleConfig;
  messages: OpenAICompatibleMessage[];
  options: OpenAICompatibleChatOptions | undefined;
  includeTemperature: boolean;
}): Record<string, unknown> => ({
  model: input.config.model,
  messages: input.messages,
  ...(input.includeTemperature
    ? { temperature: input.options?.temperature ?? 0 }
    : {}),
  stream: input.options?.stream ?? false,
  ...(input.options?.maxTokens === undefined
    ? {}
    : { max_tokens: input.options.maxTokens }),
});

const createChatCompletion = async (
  config: OpenAICompatibleConfig,
  messages: OpenAICompatibleMessage[],
  options?: OpenAICompatibleChatOptions
): Promise<string> => {
  const parsedConfig = openAICompatibleConfigSchema.parse(config);
  const complete = (includeTemperature: boolean) =>
    postJson<ChatCompletionResponse>(
      parsedConfig,
      "/chat/completions",
      buildChatCompletionBody({
        config: parsedConfig,
        includeTemperature,
        messages,
        options,
      }),
      options?.signal
    );

  let response: ChatCompletionResponse;
  try {
    response = await complete(true);
  } catch (error) {
    if (!isTemperatureRejection(error)) {
      throw error;
    }

    response = await complete(false);
  }

  return readMessageContent(response.choices?.[0]?.message?.content);
};

export type {
  OpenAICompatibleChatOptions,
  OpenAICompatibleConfig,
  OpenAICompatibleMessage,
};
export { createChatCompletion, createEmbedding, openAICompatibleConfigSchema };
