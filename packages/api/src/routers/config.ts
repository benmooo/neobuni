import {
	agentConfigInputSchema,
	type DecisionJevProviderConfigInput,
	type DecisionJevProviderConfigUpdateInput,
	decisionJevProviderConfigInputSchema,
	decisionJevProviderConfigUpdateInputSchema,
	type ProviderConfig,
	providerConfigInputSchema,
	soulConfigInputSchema,
} from "@neobuni/contracts";
import {
	getAgentConfig,
	getDatabaseRuntimeStatus,
	getDecisionJevProviderConfig,
	getMemoryEmbeddingProviderConfig,
	getMemoryReasoningProviderConfig,
	getProviderConfig,
	getSoulConfig,
	upsertAgentConfig,
	upsertProviderConfig,
	upsertSoulConfig,
} from "@neobuni/db";
import { ORPCError } from "@orpc/server";

import { protectedProcedure } from "../index";
import { run } from "../run";

// TODO(server): `GET /config/runtime/provider_checks` needs
// `runRuntimeProviderSelfChecks` from `apps/server/src/runtime`.
// TODO(server): `GET/PUT /config/feishu`, `GET/PUT /config/qq`,
// `GET/PUT /config/messaging/discord`, and `GET/PUT /config/messaging/telegram`
// need the messaging integration modules from `apps/server/src/integrations`
// (they fall back to environment-configured defaults before hitting the DB).

type PublicJevProviderConfig = Omit<ProviderConfig, "apiKey"> & {
	apiKey: "";
	hasApiKey: boolean;
};

const summarizeProviderConfig = (config: ProviderConfig | null) => {
	if (!config) {
		return {
			configured: false,
			enabled: false,
			provider: null,
			protocol: null,
			model: null,
			baseUrl: null,
			hasApiKey: false,
		};
	}

	return {
		configured: true,
		enabled: config.enabled,
		provider: config.provider,
		protocol: config.protocol,
		model: config.model,
		baseUrl: config.baseUrl,
		hasApiKey: config.apiKey.trim().length > 0,
	};
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

export const configRouter = {
	runtime: protectedProcedure.handler(async ({ context }) => {
		const [
			chatConfig,
			memoryEmbeddingConfig,
			memoryReasoningConfig,
			decisionJevConfig,
		] = await Promise.all([
			run(getProviderConfig(context.profileId)),
			run(getMemoryEmbeddingProviderConfig(context.profileId)),
			run(getMemoryReasoningProviderConfig(context.profileId)),
			run(getDecisionJevProviderConfig(context.profileId)),
		]);

		return {
			profileId: context.profileId,
			database: getDatabaseRuntimeStatus(),
			providers: {
				chat: summarizeProviderConfig(chatConfig),
				memoryEmbedding: summarizeProviderConfig(memoryEmbeddingConfig),
				memoryReasoning: summarizeProviderConfig(memoryReasoningConfig),
				decisionJev: summarizeProviderConfig(decisionJevConfig),
			},
		};
	}),

	agent: {
		get: protectedProcedure.handler(({ context }) =>
			run(getAgentConfig(context.profileId))
		),

		update: protectedProcedure
			.input(agentConfigInputSchema)
			.handler(({ input, context }) =>
				run(upsertAgentConfig(context.profileId, input))
			),
	},

	soul: {
		get: protectedProcedure.handler(({ context }) =>
			run(getSoulConfig(context.profileId))
		),

		update: protectedProcedure
			.input(soulConfigInputSchema)
			.handler(({ input, context }) =>
				run(upsertSoulConfig(context.profileId, input))
			),
	},

	provider: {
		get: protectedProcedure.handler(({ context }) =>
			run(getProviderConfig(context.profileId))
		),

		update: protectedProcedure
			.input(providerConfigInputSchema)
			.handler(({ input, context }) =>
				run(upsertProviderConfig(context.profileId, "chat", input))
			),

		jev: {
			get: protectedProcedure.handler(async ({ context }) =>
				toPublicJevProviderConfig(
					await run(getDecisionJevProviderConfig(context.profileId))
				)
			),

			update: protectedProcedure
				.input(decisionJevProviderConfigUpdateInputSchema)
				.handler(async ({ input, context }) => {
					const existing = await run(
						getDecisionJevProviderConfig(context.profileId)
					);
					const inputResult = decisionJevProviderConfigInputSchema.safeParse({
						...input,
						apiKey:
							input.apiKey.trim().length > 0
								? input.apiKey
								: (existing?.apiKey ?? ""),
					});

					if (!inputResult.success) {
						throw new ORPCError("BAD_REQUEST", {
							message:
								"首次保存 Jev 配置需要 OpenRouter API Key；后续留空会保留已保存的密钥。",
						});
					}

					const config = await run(
						upsertProviderConfig(
							context.profileId,
							"decision_jev",
							resolveJevProviderConfigInput({ existing, update: input })
						)
					);

					return toPublicJevProviderConfig(config);
				}),
		},

		memoryEmbedding: {
			get: protectedProcedure.handler(({ context }) =>
				run(getMemoryEmbeddingProviderConfig(context.profileId))
			),

			update: protectedProcedure
				.input(providerConfigInputSchema)
				.handler(({ input, context }) =>
					run(
						upsertProviderConfig(context.profileId, "memory_embedding", input)
					)
				),
		},

		memoryReasoning: {
			get: protectedProcedure.handler(({ context }) =>
				run(getMemoryReasoningProviderConfig(context.profileId))
			),

			update: protectedProcedure
				.input(providerConfigInputSchema)
				.handler(({ input, context }) =>
					run(
						upsertProviderConfig(context.profileId, "memory_reasoning", input)
					)
				),
		},
	},
};
