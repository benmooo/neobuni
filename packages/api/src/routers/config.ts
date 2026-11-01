import {
  agentConfigInputSchema,
  type ProviderConfig,
  providerConfigInputSchema,
  soulConfigInputSchema,
  webSearchProviderConfigInputSchema,
} from "@neobuni/contracts";
import {
  getAgentConfig,
  getDatabaseHealth,
  getMemoryEmbeddingProviderConfig,
  getMemoryReasoningProviderConfig,
  getProviderConfig,
  getSoulConfig,
  getWebSearchProviderConfig,
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

/**
 * Web search has no model choice; the config table still needs a non-empty
 * model, so store a stable marker instead of pretending it is an LLM.
 */
const WEB_SEARCH_MODEL = "deepseek-search";

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
        "Return the database runtime status plus a redacted summary of the chat, memory embedding, memory reasoning, and web search providers.",
      tags: ["Config"],
    })
    .handler(async ({ context }) => {
      const [
        chatConfig,
        memoryEmbeddingConfig,
        memoryReasoningConfig,
        webSearchConfig,
      ] = await Promise.all([
        run(getProviderConfig(context.profileId)),
        run(getMemoryEmbeddingProviderConfig(context.profileId)),
        run(getMemoryReasoningProviderConfig(context.profileId)),
        run(getWebSearchProviderConfig(context.profileId)),
      ]);

      const database = await getDatabaseHealth();

      return {
        profileId: context.profileId,
        database,
        providers: {
          chat: summarizeProviderConfig(chatConfig),
          memoryEmbedding: summarizeProviderConfig(memoryEmbeddingConfig),
          memoryReasoning: summarizeProviderConfig(memoryReasoningConfig),
          webSearch: summarizeProviderConfig(webSearchConfig),
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

    webSearch: {
      get: protectedProcedure
        .route({
          method: "GET",
          path: "/config/provider/web-search",
          summary: "Get the web search provider",
          description:
            "Return the DeepSeek Search/Fetch configuration used by Study Scout, including the API key. This key is independent from the chat and memory providers.",
          tags: ["Config"],
        })
        .handler(({ context }) =>
          run(getWebSearchProviderConfig(context.profileId))
        ),

      update: protectedProcedure
        .route({
          method: "PUT",
          path: "/config/provider/web-search",
          summary: "Replace the web search provider",
          description:
            "Upsert the DeepSeek Search/Fetch key, base URL, and enabled flag. Search is billed against the DeepSeek platform balance and is not proxied by inference gateways.",
          tags: ["Config"],
        })
        .input(webSearchProviderConfigInputSchema)
        .handler(({ input, context }) =>
          run(
            upsertProviderConfig(context.profileId, "web_search", {
              ...input,
              model: WEB_SEARCH_MODEL,
              protocol: "openai",
            })
          )
        ),
    },
  },
};
