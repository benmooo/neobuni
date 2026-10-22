import { z } from "zod";

const openAICompatibleConfigSchema = z.object({
	apiKey: z.string().trim().min(1),
	model: z.string().trim().min(1),
	baseUrl: z.string().trim().url().optional(),
	dimensions: z.number().int().positive().optional(),
});

type OpenAICompatibleConfig = z.infer<typeof openAICompatibleConfigSchema>;

type OpenAICompatibleMessage = {
	role: "system" | "user" | "assistant";
	content: string;
};

type OpenAICompatibleChatOptions = {
	temperature?: number;
	stream?: boolean;
	maxTokens?: number;
	signal?: AbortSignal;
};

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

const normalizeBaseUrl = (baseUrl?: string): string =>
	(baseUrl && baseUrl.trim().length > 0 ? baseUrl : DEFAULT_BASE_URL).replace(
		/\/+$/,
		""
	);

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
		},
		body: JSON.stringify(body),
		...(signal ? { signal } : {}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`OpenAI-compatible request failed (${response.status}): ${errorText}`
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

const createChatCompletion = async (
	config: OpenAICompatibleConfig,
	messages: OpenAICompatibleMessage[],
	options?: OpenAICompatibleChatOptions
): Promise<string> => {
	const response = await postJson<{
		choices?: Array<{
			message?: {
				content?: unknown;
			};
		}>;
	}>(
		config,
		"/chat/completions",
		{
			model: config.model,
			messages,
			temperature: options?.temperature ?? 0,
			stream: options?.stream ?? false,
			...(options?.maxTokens === undefined
				? {}
				: { max_tokens: options.maxTokens }),
		},
		options?.signal
	);

	return readMessageContent(response.choices?.[0]?.message?.content);
};

export type {
	OpenAICompatibleChatOptions,
	OpenAICompatibleConfig,
	OpenAICompatibleMessage,
};
export { createChatCompletion, createEmbedding, openAICompatibleConfigSchema };
