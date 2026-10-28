import { z } from "zod";

const providerVendorSchema = z.enum([
  "mock",
  "openai",
  "openrouter",
  "anthropic",
  "deepseek",
  "qwen",
  "opencode",
]);

const providerProtocolSchema = z.enum(["mock", "openai", "anthropic"]);

/**
 * OpenCode Go ($10/month) and OpenCode Console (pay-as-you-go) accept the same
 * API keys, so one vendor covers both plans. They do NOT share endpoints though:
 * Go lives under `/inference/go/...` and a Go-only account gets
 * `402 Insufficient account funds` on the Console path. Go is the default
 * because it is the plan this vendor was added for.
 */
const OPENCODE_DEFAULT_BASE_URL = "https://opencode.ai/inference/go/openai/v1";
const OPENCODE_CONSOLE_BASE_URL = "https://opencode.ai/inference/openai/v1";

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
    const protocol = value.protocol;

    if (
      value.provider === "mock" &&
      protocol !== undefined &&
      protocol !== "mock"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["protocol"],
        message: "Mock provider must use the mock protocol.",
      });
    }

    if (protocol === "mock" && value.provider !== "mock") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["provider"],
        message: "Only the mock provider can use the mock protocol.",
      });
    }

    const effectiveProtocol =
      protocol ?? (value.provider === "mock" ? "mock" : "openai");
    if (effectiveProtocol !== "mock" && value.apiKey.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["apiKey"],
        message: "This provider requires an API key.",
      });
    }

    if (
      (value.provider === "deepseek" || value.provider === "qwen") &&
      value.baseUrl.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["baseUrl"],
        message: "This provider requires a Base URL.",
      });
    }

    if (value.baseUrl.length > 0) {
      const parsed = z.url().safeParse(value.baseUrl);

      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["baseUrl"],
          message: "Base URL must be a valid URL.",
        });
      }
    }

    if (protocol !== undefined) {
      if (value.provider === "openai" && protocol !== "openai") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["protocol"],
          message: "OpenAI vendor must use the OpenAI protocol.",
        });
      }

      if (value.provider === "openrouter" && protocol !== "openai") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["protocol"],
          message: "OpenRouter vendor must use the OpenAI protocol.",
        });
      }

      if (value.provider === "anthropic" && protocol !== "anthropic") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["protocol"],
          message: "Anthropic vendor must use the Anthropic protocol.",
        });
      }

      if (value.provider === "qwen" && protocol !== "openai") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["protocol"],
          message: "Qwen vendor currently supports only the OpenAI protocol.",
        });
      }

      if (value.provider === "opencode" && protocol !== "openai") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["protocol"],
          message: "OpenCode vendor must use the OpenAI protocol.",
        });
      }
    }
  });

const providerModelListInputSchema = z.object({
  provider: providerVendorSchema,
  baseUrl: z.string().trim().max(500).default(""),
});

const providerModelListSchema = z.object({
  models: z.array(z.string().trim().min(1)),
});

const providerConfigSchema = providerConfigInputSchema.safeExtend({
  id: z.string(),
  profileId: z.string(),
  protocol: providerProtocolSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export {
  OPENCODE_CONSOLE_BASE_URL,
  OPENCODE_DEFAULT_BASE_URL,
  providerConfigInputSchema,
  providerConfigSchema,
  providerModelListInputSchema,
  providerModelListSchema,
  providerProtocolSchema,
  providerVendorSchema,
};

export type ProviderConfig = z.infer<typeof providerConfigSchema>;
export type ProviderModelList = z.infer<typeof providerModelListSchema>;
export type ProviderModelListInput = z.infer<
  typeof providerModelListInputSchema
>;
export type ProviderConfigInput = z.infer<typeof providerConfigInputSchema>;
export type ProviderProtocol = z.infer<typeof providerProtocolSchema>;
export type ProviderVendor = z.infer<typeof providerVendorSchema>;
