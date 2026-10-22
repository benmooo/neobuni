import type { ProviderProtocol, ProviderVendor } from "@neobuni/contracts";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { db, fromPromise } from "../client";
import { providerConfigsTable } from "../schema";

type Slot = "chat" | "memory_embedding" | "memory_reasoning" | "decision_jev";

const deriveProtocol = (
  provider: ProviderVendor,
  slot: Slot,
): ProviderProtocol => {
  if (provider === "mock") return "mock";
  if (provider === "anthropic") return "anthropic";
  if (provider === "deepseek") return slot === "chat" ? "anthropic" : "openai";
  return "openai";
};

const deriveBaseUrl = (input: {
  provider: ProviderVendor;
  slot: Slot;
  protocol: ProviderProtocol;
  baseUrl: string;
}) => {
  const normalized = input.baseUrl.trim();

  if (input.provider === "deepseek") {
    if (input.slot === "chat" && input.protocol === "anthropic") {
      if (
        normalized.length === 0 ||
        normalized === "https://api.deepseek.com" ||
        normalized === "https://api.deepseek.com/v1"
      ) {
        return "https://api.deepseek.com/anthropic";
      }
    }

    if (
      input.protocol === "openai" &&
      (normalized.length === 0 || normalized === "https://api.deepseek.com/v1")
    ) {
      return "https://api.deepseek.com";
    }
  }

  if (input.provider === "qwen" && normalized.length === 0) {
    return "https://dashscope.aliyuncs.com/compatible-mode/v1";
  }

  if (input.provider === "openrouter" && normalized.length === 0) {
    return "https://openrouter.ai/api/v1";
  }

  return normalized;
};

const normalizeProviderVendor = (value: string): ProviderVendor => {
  if (value === "openai") return "openai";
  if (value === "openrouter") return "openrouter";
  if (value === "anthropic") return "anthropic";
  if (value === "deepseek") return "deepseek";
  if (value === "qwen") return "qwen";
  return "mock";
};

const normalizeProtocol = (
  value: string,
  provider: ProviderVendor,
  slot: Slot,
): ProviderProtocol => {
  if (value === "openai") return "openai";
  if (value === "anthropic") return "anthropic";
  if (value === "mock") return "mock";
  return deriveProtocol(provider, slot);
};

const parseMetadata = (value: string): Record<string, unknown> => {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const defaultChatConfig = (profileId: string) => {
  const now = new Date().toISOString();
  return {
    id: "provider-config-default",
    profileId,
    slot: "chat" as const,
    provider: "mock" as const,
    protocol: "mock" as const,
    model: "buni-mock",
    apiKey: "",
    baseUrl: "",
    enabled: true,
    metadata: {} as Record<string, unknown>,
    createdAt: now,
    updatedAt: now,
  };
};

const normalize = (row: typeof providerConfigsTable.$inferSelect) => {
  const provider = normalizeProviderVendor(row.provider);
  const slot = row.slot as Slot;
  const protocol = normalizeProtocol(row.protocol, provider, slot);

  return {
    id: row.id,
    profileId: row.profileId,
    slot,
    provider,
    protocol,
    model: row.model,
    apiKey: row.apiKey,
    baseUrl: deriveBaseUrl({
      provider,
      slot,
      protocol,
      baseUrl: row.baseUrl,
    }),
    enabled: row.enabled,
    metadata: parseMetadata(row.metadataJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

const getProviderConfigBySlot = Effect.fnUntraced(function* (
  profileId: string,
  slot: Slot,
) {
  const existing = yield* fromPromise("getProviderConfigBySlot", () =>
    db.query.providerConfigsTable.findFirst({
      where: {
        profileId,
        slot,
      },
    }),
  );
  return existing ? normalize(existing) : null;
});

const getProviderConfig = Effect.fnUntraced(function* (profileId: string) {
  const config = yield* getProviderConfigBySlot(profileId, "chat");
  return config ?? defaultChatConfig(profileId);
});

const getMemoryEmbeddingProviderConfig = Effect.fnUntraced(function* (
  profileId: string,
) {
  return yield* getProviderConfigBySlot(profileId, "memory_embedding");
});

const getMemoryReasoningProviderConfig = Effect.fnUntraced(function* (
  profileId: string,
) {
  return yield* getProviderConfigBySlot(profileId, "memory_reasoning");
});

const getDecisionJevProviderConfig = Effect.fnUntraced(function* (
  profileId: string,
) {
  return yield* getProviderConfigBySlot(profileId, "decision_jev");
});

const upsertProviderConfig = Effect.fnUntraced(function* (
  profileId: string,
  slot: Slot,
  input: {
    provider: ProviderVendor;
    protocol?: ProviderProtocol;
    model: string;
    apiKey: string;
    baseUrl: string;
    enabled: boolean;
    metadata?: Record<string, unknown>;
  },
) {
  const existing = yield* fromPromise("upsertProviderConfig", () =>
    db.query.providerConfigsTable.findFirst({
      where: {
        profileId,
        slot,
      },
    }),
  );

  const protocol = input.protocol ?? deriveProtocol(input.provider, slot);
  const now = new Date().toISOString();
  const metadataJson =
    input.metadata === undefined ? "{}" : JSON.stringify(input.metadata);

  if (!existing) {
    const next = {
      id: crypto.randomUUID(),
      profileId,
      slot,
      provider: input.provider,
      protocol,
      model: input.model,
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      enabled: input.enabled,
      metadataJson,
      createdAt: now,
      updatedAt: now,
    };
    yield* fromPromise("upsertProviderConfig", () =>
      db.insert(providerConfigsTable).values(next),
    );
    return normalize(next);
  }

  const updates = {
    provider: input.provider,
    protocol,
    model: input.model,
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    enabled: input.enabled,
    metadataJson:
      input.metadata === undefined ? existing.metadataJson : metadataJson,
    updatedAt: now,
  };

  yield* fromPromise("upsertProviderConfig", () =>
    db
      .update(providerConfigsTable)
      .set(updates)
      .where(eq(providerConfigsTable.id, existing.id)),
  );

  return normalize({ ...existing, ...updates });
});

export {
  getDecisionJevProviderConfig,
  getMemoryEmbeddingProviderConfig,
  getMemoryReasoningProviderConfig,
  getProviderConfig,
  getProviderConfigBySlot,
  upsertProviderConfig,
};
