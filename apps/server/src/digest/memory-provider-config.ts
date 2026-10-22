import type { getProviderConfigBySlot } from "@neobuni/db";
import type { Effect } from "effect";

import type { OpenAICompatibleConfig } from "../providers/openai-compatible-client";

type ProviderConfigRecord = Effect.Success<
	ReturnType<typeof getProviderConfigBySlot>
>;

const DEFAULT_DIGEST_THRESHOLD = 50;

const isConfigured = (
	config: ProviderConfigRecord
): config is Exclude<ProviderConfigRecord, null> =>
	config !== null &&
	config.enabled &&
	config.protocol === "openai" &&
	config.apiKey.trim().length > 0 &&
	config.model.trim().length > 0;

const toOpenAICompatibleConfig = (
	config: ProviderConfigRecord
): OpenAICompatibleConfig | null => {
	if (!isConfigured(config)) {
		return null;
	}

	const rawDimensions = config.metadata.dimension;

	return {
		apiKey: config.apiKey,
		model: config.model,
		baseUrl: config.baseUrl || undefined,
		dimensions:
			typeof rawDimensions === "number" &&
			Number.isInteger(rawDimensions) &&
			rawDimensions > 0
				? rawDimensions
				: undefined,
	};
};

const getDigestThreshold = (config: ProviderConfigRecord): number => {
	if (config === null) {
		return DEFAULT_DIGEST_THRESHOLD;
	}

	const rawThreshold = config.metadata.digestThreshold;
	return typeof rawThreshold === "number"
		? rawThreshold
		: DEFAULT_DIGEST_THRESHOLD;
};

export {
	DEFAULT_DIGEST_THRESHOLD,
	getDigestThreshold,
	toOpenAICompatibleConfig,
};
