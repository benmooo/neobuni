import type {
	ProviderProtocol,
	ProviderVendor,
	RuntimeProviderCheck,
	RuntimeProviderCheckSlot,
} from "@neobuni/contracts";
import { runtimeProviderChecksSchema } from "@neobuni/contracts";
import { chat } from "@tanstack/ai";

import { createEmbedding } from "../providers/openai-compatible-client";
import { createServerTextAdapter } from "../providers/provider-adapters";

type ProviderConfig = {
	provider: ProviderVendor;
	protocol: ProviderProtocol;
	model: string;
	apiKey: string;
	baseUrl: string;
	enabled: boolean;
} | null;

const trimPreview = (value: string) =>
	value.length > 80 ? `${value.slice(0, 80)}...` : value;

const buildCheck = (input: RuntimeProviderCheck): RuntimeProviderCheck => input;

const buildSkippedCheck = (
	slot: RuntimeProviderCheckSlot,
	config: ProviderConfig,
	message: string
): RuntimeProviderCheck =>
	buildCheck({
		slot,
		status: "skip",
		provider: config?.provider ?? null,
		model: config?.model ?? null,
		checkedAt: new Date().toISOString(),
		durationMs: null,
		message,
		detail: null,
	});

const buildFailedCheck = (input: {
	slot: RuntimeProviderCheckSlot;
	config: Exclude<ProviderConfig, null>;
	startedAt: number;
	message: string;
}): RuntimeProviderCheck =>
	buildCheck({
		slot: input.slot,
		status: "fail",
		provider: input.config.provider,
		model: input.config.model,
		checkedAt: new Date().toISOString(),
		durationMs: Math.max(0, Date.now() - input.startedAt),
		message: input.message,
		detail: null,
	});

const buildPassedCheck = (input: {
	slot: RuntimeProviderCheckSlot;
	config: Exclude<ProviderConfig, null>;
	startedAt: number;
	message: string;
	detail?: Record<string, unknown> | null;
}): RuntimeProviderCheck =>
	buildCheck({
		slot: input.slot,
		status: "pass",
		provider: input.config.provider,
		model: input.config.model,
		checkedAt: new Date().toISOString(),
		durationMs: Math.max(0, Date.now() - input.startedAt),
		message: input.message,
		detail: input.detail ?? null,
	});

const collectChatText = async (config: Exclude<ProviderConfig, null>) => {
	let text = "";

	const stream = chat({
		adapter: createServerTextAdapter(config),
		messages: [
			{
				role: "user",
				content: "Reply with ok.",
			},
		],
	});

	for await (const chunk of stream) {
		if (chunk.type === "TEXT_MESSAGE_CONTENT" && chunk.delta) {
			text += chunk.delta;
		}

		if (chunk.type === "RUN_ERROR") {
			throw new Error(chunk.message || "Provider probe failed");
		}
	}

	return text.trim();
};

const probeChatProvider = async (
	slot: RuntimeProviderCheckSlot,
	config: Exclude<ProviderConfig, null>
) => {
	const startedAt = Date.now();

	try {
		const preview = trimPreview(await collectChatText(config));

		return buildPassedCheck({
			slot,
			config,
			startedAt,
			message: preview.length > 0 ? `Probe ok: ${preview}` : "Probe ok",
			detail:
				preview.length > 0
					? {
							preview,
							protocol: config.protocol,
						}
					: {
							protocol: config.protocol,
						},
		});
	} catch (error) {
		return buildFailedCheck({
			slot,
			config,
			startedAt,
			message: error instanceof Error ? error.message : "Provider probe failed",
		});
	}
};

const probeEmbeddingProvider = async (
	slot: RuntimeProviderCheckSlot,
	config: Exclude<ProviderConfig, null>
) => {
	const startedAt = Date.now();

	if (config.protocol !== "openai") {
		return buildSkippedCheck(
			slot,
			config,
			"Embedding probe currently supports only OpenAI-compatible transports"
		);
	}

	try {
		const embedding = await createEmbedding(
			{
				apiKey: config.apiKey,
				model: config.model,
				baseUrl: config.baseUrl || undefined,
			},
			"provider health check"
		);

		return buildPassedCheck({
			slot,
			config,
			startedAt,
			message: `Probe ok: embedding length ${embedding.length}`,
			detail: {
				protocol: config.protocol,
				embeddingLength: embedding.length,
			},
		});
	} catch (error) {
		return buildFailedCheck({
			slot,
			config,
			startedAt,
			message: error instanceof Error ? error.message : "Provider probe failed",
		});
	}
};

const runProviderCheck = async (
	slot: RuntimeProviderCheckSlot,
	config: ProviderConfig
) => {
	if (!config) {
		return buildSkippedCheck(slot, config, "Provider not configured");
	}

	if (!config.enabled) {
		return buildSkippedCheck(slot, config, "Provider disabled");
	}

	if (config.provider === "mock" || config.protocol === "mock") {
		return buildSkippedCheck(
			slot,
			config,
			"Mock provider uses no external probe"
		);
	}

	if (config.apiKey.trim().length === 0) {
		return buildSkippedCheck(slot, config, "Missing API key");
	}

	if (slot === "memory_embedding") {
		return probeEmbeddingProvider(slot, config);
	}

	return probeChatProvider(slot, config);
};

const runRuntimeProviderSelfChecks = async (input: {
	chatConfig: ProviderConfig;
	memoryEmbeddingConfig: ProviderConfig;
	memoryReasoningConfig: ProviderConfig;
}) =>
	runtimeProviderChecksSchema.parse({
		checks: await Promise.all([
			runProviderCheck("chat", input.chatConfig),
			runProviderCheck("memory_embedding", input.memoryEmbeddingConfig),
			runProviderCheck("memory_reasoning", input.memoryReasoningConfig),
		]),
	});

export { runRuntimeProviderSelfChecks };
