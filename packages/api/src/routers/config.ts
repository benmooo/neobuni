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
  runtime: protectedProcedure
    .route({
      method: "GET",
      path: "/config/runtime",
      summary: "Get the runtime configuration summary",
      description:
        "Return the database runtime status plus a redacted summary of the chat, memory embedding, and memory reasoning providers.",
      tags: ["Config"],
    })
    .handler(async ({ context }) => {
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
    get: protectedProcedure
      .route({
        method: "GET",
        path: "/config/agent",
        summary: "Get the agent configuration",
        description:
          "Return the assistant name, avatar, user name, and user persona for the current profile.",
        tags: ["Config"],
      })
      .handler(({ context }) => run(getAgentConfig(context.profileId))),

    update: protectedProcedure
      .route({
        method: "PUT",
        path: "/config/agent",
        summary: "Replace the agent configuration",
        description:
          "Upsert the assistant name, avatar, user name, and user persona for the current profile.",
        tags: ["Config"],
      })
      .input(agentConfigInputSchema)
      .handler(({ input, context }) =>
        run(upsertAgentConfig(context.profileId, input))
      ),
  },

  soul: {
    get: protectedProcedure
      .route({
        method: "GET",
        path: "/config/soul",
        summary: "Get the soul configuration",
        description:
          "Return the assistant name, temperament, relationship, values, drives, and expression settings.",
        tags: ["Config"],
      })
      .handler(({ context }) => run(getSoulConfig(context.profileId))),

    update: protectedProcedure
      .route({
        method: "PUT",
        path: "/config/soul",
        summary: "Replace the soul configuration",
        description:
          "Upsert the assistant temperament, relationship, values, drives, and expression settings.",
        tags: ["Config"],
      })
      .input(soulConfigInputSchema)
      .handler(({ input, context }) =>
        run(upsertSoulConfig(context.profileId, input))
      ),
  },

  provider: {
    get: protectedProcedure
      .route({
        method: "GET",
        path: "/config/provider",
        summary: "Get the chat provider configuration",
        description:
          "Return the chat provider configuration, including the API key; treat the response as a secret.",
        tags: ["Config"],
      })
      .handler(({ context }) => run(getProviderConfig(context.profileId))),

    update: protectedProcedure
      .route({
        method: "PUT",
        path: "/config/provider",
        summary: "Replace the chat provider configuration",
        description:
          "Upsert the chat provider vendor, protocol, model, base URL, API key, and enabled flag.",
        tags: ["Config"],
      })
      .input(providerConfigInputSchema)
      .handler(({ input, context }) =>
        run(upsertProviderConfig(context.profileId, "chat", input))
      ),

    memoryEmbedding: {
      get: protectedProcedure
        .route({
          method: "GET",
          path: "/config/provider/memory-embedding",
          summary: "Get the memory embedding provider",
          description:
            "Return the provider used to embed memories and knowledge chunks, including the API key.",
          tags: ["Config"],
        })
        .handler(({ context }) =>
          run(getMemoryEmbeddingProviderConfig(context.profileId))
        ),

      update: protectedProcedure
        .route({
          method: "PUT",
          path: "/config/provider/memory-embedding",
          summary: "Replace the memory embedding provider",
          description:
            "Upsert the provider used to embed memories and knowledge chunks.",
          tags: ["Config"],
        })
        .input(providerConfigInputSchema)
        .handler(({ input, context }) =>
          run(
            upsertProviderConfig(context.profileId, "memory_embedding", input)
          )
        ),
    },

    memoryReasoning: {
      get: protectedProcedure
        .route({
          method: "GET",
          path: "/config/provider/memory-reasoning",
          summary: "Get the memory reasoning provider",
          description:
            "Return the provider used for memory digests, grading, and lesson enrichment, including the API key.",
          tags: ["Config"],
        })
        .handler(({ context }) =>
          run(getMemoryReasoningProviderConfig(context.profileId))
        ),

      update: protectedProcedure
        .route({
          method: "PUT",
          path: "/config/provider/memory-reasoning",
          summary: "Replace the memory reasoning provider",
          description:
            "Upsert the provider used for memory digests, grading, and lesson enrichment.",
          tags: ["Config"],
        })
        .input(providerConfigInputSchema)
        .handler(({ input, context }) =>
          run(
            upsertProviderConfig(context.profileId, "memory_reasoning", input)
          )
        ),
    },
  },
};
