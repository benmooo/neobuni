import { z } from "zod"

const providerVendorSchema = z.enum([
  "mock",
  "openai",
  "openrouter",
  "anthropic",
  "deepseek",
  "qwen",
])

const providerProtocolSchema = z.enum(["mock", "openai", "anthropic"])

const providerConfigInputSchema = z
  .object({
    provider: providerVendorSchema,
    protocol: providerProtocolSchema.optional(),
    model: z.string().trim().min(1).max(120),
    apiKey: z.string().trim().max(400).default(""),
    baseUrl: z.string().trim().max(500).default(""),
    enabled: z.boolean().default(true),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((value, ctx) => {
    const protocol = value.protocol

    if (
      value.provider === "mock" &&
      protocol !== undefined &&
      protocol !== "mock"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["protocol"],
        message: "Mock provider must use the mock protocol.",
      })
    }

    if (protocol === "mock" && value.provider !== "mock") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["provider"],
        message: "Only the mock provider can use the mock protocol.",
      })
    }

    const effectiveProtocol =
      protocol ?? (value.provider === "mock" ? "mock" : "openai")
    if (effectiveProtocol !== "mock" && value.apiKey.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["apiKey"],
        message: "This provider requires an API key.",
      })
    }

    if (
      (value.provider === "deepseek" || value.provider === "qwen") &&
      value.baseUrl.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["baseUrl"],
        message: "This provider requires a Base URL.",
      })
    }

    if (value.baseUrl.length > 0) {
      const parsed = z.url().safeParse(value.baseUrl)

      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["baseUrl"],
          message: "Base URL must be a valid URL.",
        })
      }
    }

    if (protocol !== undefined) {
      if (value.provider === "openai" && protocol !== "openai") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["protocol"],
          message: "OpenAI vendor must use the OpenAI protocol.",
        })
      }

      if (value.provider === "openrouter" && protocol !== "openai") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["protocol"],
          message: "OpenRouter vendor must use the OpenAI protocol.",
        })
      }

      if (value.provider === "anthropic" && protocol !== "anthropic") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["protocol"],
          message: "Anthropic vendor must use the Anthropic protocol.",
        })
      }

      if (value.provider === "qwen" && protocol !== "openai") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["protocol"],
          message: "Qwen vendor currently supports only the OpenAI protocol.",
        })
      }
    }
  })

const providerConfigSchema = providerConfigInputSchema.safeExtend({
  id: z.string(),
  profileId: z.string(),
  protocol: providerProtocolSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

const decisionJevProviderConfigInputSchema = z.object({
  provider: z.literal("openrouter"),
  protocol: z.literal("openai"),
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(1).max(400),
  baseUrl: z.url().max(500),
  enabled: z.boolean().default(true),
  metadata: z
    .object({
      timeoutMs: z.number().int().min(500).max(30_000).default(3_000),
      maxRetries: z.number().int().min(0).max(3).default(1),
      retrievalShadowEnabled: z.boolean().default(false),
      graphV2ShadowEnabled: z.boolean().default(false),
      evidenceRelevanceShadowEnabled: z.boolean().default(false),
      retrievalRoutingEnabled: z.boolean().default(false),
      retrievalConfidenceThreshold: z.number().min(0).max(1).default(0.85),
      retrievalMinComparedPairs: z
        .number()
        .int()
        .min(0)
        .max(10_000)
        .default(20),
      retrievalMinAgreementRate: z.number().min(0).max(1).default(0.85),
      retrievalMaxAverageLatencyMs: z
        .number()
        .int()
        .min(1)
        .max(30_000)
        .default(3_000),
      retrievalMaxProviderErrorRate: z.number().min(0).max(1).default(0.05),
      nextActionShadowEnabled: z.boolean().default(false),
    })
    .default({
      timeoutMs: 3_000,
      maxRetries: 1,
      retrievalShadowEnabled: false,
      graphV2ShadowEnabled: false,
      evidenceRelevanceShadowEnabled: false,
      retrievalRoutingEnabled: false,
      retrievalConfidenceThreshold: 0.85,
      retrievalMinComparedPairs: 20,
      retrievalMinAgreementRate: 0.85,
      retrievalMaxAverageLatencyMs: 3_000,
      retrievalMaxProviderErrorRate: 0.05,
      nextActionShadowEnabled: false,
    }),
})

const decisionJevProviderConfigUpdateInputSchema =
  decisionJevProviderConfigInputSchema.extend({
    apiKey: z.string().trim().max(400),
  })

export {
  decisionJevProviderConfigInputSchema,
  decisionJevProviderConfigUpdateInputSchema,
  providerConfigInputSchema,
  providerConfigSchema,
  providerProtocolSchema,
  providerVendorSchema,
}

export type DecisionJevProviderConfigInput = z.infer<
  typeof decisionJevProviderConfigInputSchema
>
export type DecisionJevProviderConfigUpdateInput = z.infer<
  typeof decisionJevProviderConfigUpdateInputSchema
>
export type ProviderConfig = z.infer<typeof providerConfigSchema>
export type ProviderConfigInput = z.infer<typeof providerConfigInputSchema>
export type ProviderProtocol = z.infer<typeof providerProtocolSchema>
export type ProviderVendor = z.infer<typeof providerVendorSchema>
