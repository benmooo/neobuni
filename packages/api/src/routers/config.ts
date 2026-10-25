import {
  agentConfigInputSchema,
  type ProviderConfig,
  providerConfigInputSchema,
  soulConfigInputSchema,
} from "@neobuni/contracts";
import {
  getAgentConfig,
  getDatabaseRuntimeStatus,
  getMemoryEmbeddingProviderConfig,
  getMemoryReasoningProviderConfig,
  getProviderConfig,
  getSoulConfig,
  upsertAgentConfig,
  upsertProviderConfig,
  upsertSoulConfig,
} from "@neobuni/db";
import { protectedProcedure } from "../index";
import { run } from "../run";

// TODO(server): `GET /config/runtime/provider_checks` needs
// `runRuntimeProviderSelfChecks` from `apps/server/src/runtime`.
// TODO(server): `GET/PUT /config/feishu`, `GET/PUT /config/qq`,
// `GET/PUT /config/messaging/discord`, and `GET/PUT /config/messaging/telegram`
// need the messaging integration modules from `apps/server/src/integrations`
// (they fall back to environment-configured defaults before hitting the DB).

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

export const configRouter = {
  runtime: protectedProcedure.handler(async ({ context }) => {
    const [chatConfig, memoryEmbeddingConfig, memoryReasoningConfig] =
      await Promise.all([
        run(getProviderConfig(context.profileId)),
        run(getMemoryEmbeddingProviderConfig(context.profileId)),
        run(getMemoryReasoningProviderConfig(context.profileId)),
      ]);

    return {
      profileId: context.profileId,
      database: getDatabaseRuntimeStatus(),
      providers: {
        chat: summarizeProviderConfig(chatConfig),
        memoryEmbedding: summarizeProviderConfig(memoryEmbeddingConfig),
        memoryReasoning: summarizeProviderConfig(memoryReasoningConfig),
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
