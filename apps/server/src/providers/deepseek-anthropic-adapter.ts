import type { AnyTextAdapter } from "@tanstack/ai";
import { createAnthropicChat } from "@tanstack/ai-anthropic";

type DeepSeekAnthropicConfig = {
	model: string;
	apiKey: string;
	baseUrl: string;
};

type AnthropicRequestParams = {
	tools?: Array<Record<string, unknown>>;
};

type AnthropicAdapterWithInternals = AnyTextAdapter & {
	mapCommonOptionsToAnthropic?: (options: unknown) => AnthropicRequestParams;
};

const stripUnsupportedDeepSeekToolFields = (
	requestParams: AnthropicRequestParams
): AnthropicRequestParams => ({
	...requestParams,
	...(requestParams.tools
		? {
				tools: requestParams.tools.map((tool) => {
					if (tool.type !== "custom") {
						return tool;
					}

					const { type: _type, ...rest } = tool;
					return rest;
				}),
			}
		: {}),
});

const createDeepSeekAnthropicAdapter = (
	config: DeepSeekAnthropicConfig
): AnyTextAdapter => {
	const adapter = createAnthropicChat(
		config.model as never,
		config.apiKey,
		config.baseUrl ? { baseURL: config.baseUrl } : undefined
	) as unknown as AnthropicAdapterWithInternals;

	const originalMapCommonOptionsToAnthropic =
		adapter.mapCommonOptionsToAnthropic?.bind(adapter);

	if (originalMapCommonOptionsToAnthropic) {
		adapter.mapCommonOptionsToAnthropic = (options) =>
			stripUnsupportedDeepSeekToolFields(
				originalMapCommonOptionsToAnthropic(options)
			);
	}

	return adapter;
};

export { createDeepSeekAnthropicAdapter, stripUnsupportedDeepSeekToolFields };
