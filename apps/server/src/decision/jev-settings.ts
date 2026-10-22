import {
	type DecisionJevProviderConfigInput,
	type DecisionJevProviderConfigUpdateInput,
	decisionJevProviderConfigInputSchema,
	type ProviderConfig,
} from "@neobuni/contracts";

type PublicJevProviderConfig = Omit<ProviderConfig, "apiKey"> & {
	apiKey: "";
	hasApiKey: boolean;
};

const toPublicJevProviderConfig = (
	config: ProviderConfig | null
): PublicJevProviderConfig | null =>
	config
		? {
				...config,
				apiKey: "",
				hasApiKey: config.apiKey.trim().length > 0,
			}
		: null;

const resolveJevProviderConfigInput = (input: {
	existing: ProviderConfig | null;
	update: DecisionJevProviderConfigUpdateInput;
}): DecisionJevProviderConfigInput =>
	decisionJevProviderConfigInputSchema.parse({
		...input.update,
		apiKey:
			input.update.apiKey.trim().length > 0
				? input.update.apiKey
				: (input.existing?.apiKey ?? ""),
	});

export type { PublicJevProviderConfig };
export { resolveJevProviderConfigInput, toPublicJevProviderConfig };
