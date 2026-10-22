import type { MessagingPlatform } from "@neobuni/contracts";
import { and, asc, eq } from "drizzle-orm";
import { Effect } from "effect";

import { db, fromPromise } from "../client";
import {
  externalConversationBindingsTable,
  externalEventReceiptsTable,
  messagingIntegrationsTable,
  messagingTargetsTable,
} from "../schema";

interface StoredMessagingTarget {
  alias: string;
  enabled: boolean;
  label: string;
  metadata: Record<string, unknown>;
  platform: MessagingPlatform;
  targetId: string;
  targetType: string;
}

interface StoredMessagingPlatformConfig {
  appId: string;
  appSecret: string;
  baseUrl: string;
  botToken: string;
  createdAt: string;
  enabled: boolean;
  id: string;
  metadata: Record<string, unknown>;
  platform: MessagingPlatform;
  profileId: string;
  publicKey: string;
  source: "database";
  targets: StoredMessagingTarget[];
  updatedAt: string;
  webhookSecret: string;
}

type StoredMessagingIntegration = Omit<
  StoredMessagingPlatformConfig,
  "source" | "targets"
>;

type ExternalConversationScopeType = "guild_channel" | "telegram_chat";

interface StoredExternalConversationBinding {
  conversationId: string;
  createdAt: string;
  id: string;
  lastInboundAt: string | null;
  platform: MessagingPlatform;
  profileId: string;
  scopeKey: string;
  scopeType: ExternalConversationScopeType;
  updatedAt: string;
}

interface StoredExternalEventReceipt {
  eventId: string;
  id: string;
  platform: MessagingPlatform;
  profileId: string;
  receivedAt: string;
}

interface MessagingPlatformTargetInput {
  alias: string;
  enabled: boolean;
  label: string;
  metadata: Record<string, unknown>;
  targetId: string;
  targetType: string;
}

interface MessagingPlatformConfigInput {
  appId: string;
  appSecret?: string;
  baseUrl?: string;
  botToken: string;
  enabled: boolean;
  metadata: Record<string, unknown>;
  publicKey: string;
  targets: MessagingPlatformTargetInput[];
  webhookSecret: string;
}

const parseJson = (value: string | null | undefined) => {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const normalizeOptional = (value: string | null | undefined) =>
  value?.trim() ?? "";

const toStoredMessagingTarget = (
  row: typeof messagingTargetsTable.$inferSelect
): StoredMessagingTarget => ({
  platform: row.platform as MessagingPlatform,
  alias: row.alias,
  label: row.label,
  targetType: row.targetType,
  targetId: row.targetId,
  enabled: row.enabled,
  metadata: parseJson(row.metadataJson),
});

const toStoredMessagingIntegration = (
  row: typeof messagingIntegrationsTable.$inferSelect
): StoredMessagingIntegration => ({
  id: row.id,
  profileId: row.profileId,
  platform: row.platform as MessagingPlatform,
  enabled: row.enabled,
  botToken: row.botToken,
  appId: normalizeOptional(row.appId),
  appSecret: normalizeOptional(row.appSecret),
  publicKey: normalizeOptional(row.publicKey),
  webhookSecret: normalizeOptional(row.webhookSecret),
  baseUrl: normalizeOptional(row.baseUrl),
  metadata: parseJson(row.metadataJson),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toExternalConversationBinding = (
  row: typeof externalConversationBindingsTable.$inferSelect
): StoredExternalConversationBinding => ({
  id: row.id,
  profileId: row.profileId,
  platform: row.platform as MessagingPlatform,
  scopeType: row.scopeType as ExternalConversationScopeType,
  scopeKey: row.scopeKey,
  conversationId: row.conversationId,
  lastInboundAt: row.lastInboundAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toExternalEventReceipt = (
  row: typeof externalEventReceiptsTable.$inferSelect
): StoredExternalEventReceipt => ({
  id: row.id,
  profileId: row.profileId,
  platform: row.platform as MessagingPlatform,
  eventId: row.eventId,
  receivedAt: row.receivedAt,
});

export const getStoredMessagingIntegration = Effect.fnUntraced(function* (
  profileId: string,
  platform: MessagingPlatform
) {
  const row = yield* fromPromise("getStoredMessagingIntegration", async () => {
    try {
      return await db.query.messagingIntegrationsTable.findFirst({
        where: {
          profileId,
          platform,
        },
      });
    } catch {
      return null;
    }
  });

  return row ? toStoredMessagingIntegration(row) : null;
});

export const getMessagingIntegrationByPlatformAppId = Effect.fnUntraced(
  function* (platform: MessagingPlatform, appId: string) {
    const normalizedAppId = normalizeOptional(appId);

    if (normalizedAppId.length === 0) {
      return null;
    }

    const row = yield* fromPromise(
      "getMessagingIntegrationByPlatformAppId",
      async () => {
        try {
          return await db.query.messagingIntegrationsTable.findFirst({
            where: {
              platform,
              appId: normalizedAppId,
            },
          });
        } catch {
          return null;
        }
      }
    );

    return row ? toStoredMessagingIntegration(row) : null;
  }
);

export const getMessagingIntegrationByWebhookSecret = Effect.fnUntraced(
  function* (platform: MessagingPlatform, webhookSecret: string) {
    const normalizedWebhookSecret = normalizeOptional(webhookSecret);

    if (normalizedWebhookSecret.length === 0) {
      return null;
    }

    const row = yield* fromPromise(
      "getMessagingIntegrationByWebhookSecret",
      async () => {
        try {
          return await db.query.messagingIntegrationsTable.findFirst({
            where: {
              platform,
              webhookSecret: normalizedWebhookSecret,
            },
          });
        } catch {
          return null;
        }
      }
    );

    return row ? toStoredMessagingIntegration(row) : null;
  }
);

export const listStoredMessagingTargets = Effect.fnUntraced(function* (
  profileId: string,
  platform?: MessagingPlatform
) {
  const rows = yield* fromPromise("listStoredMessagingTargets", async () => {
    try {
      return await db
        .select()
        .from(messagingTargetsTable)
        .where(
          platform
            ? and(
                eq(messagingTargetsTable.profileId, profileId),
                eq(messagingTargetsTable.platform, platform)
              )
            : eq(messagingTargetsTable.profileId, profileId)
        )
        .orderBy(
          asc(messagingTargetsTable.platform),
          asc(messagingTargetsTable.alias)
        );
    } catch {
      return [];
    }
  });

  return rows.map(toStoredMessagingTarget);
});

export const getStoredMessagingPlatformConfig = Effect.fnUntraced(function* (
  profileId: string,
  platform: MessagingPlatform
) {
  const integration = yield* getStoredMessagingIntegration(profileId, platform);
  const targets = yield* listStoredMessagingTargets(profileId, platform);

  if (!integration && targets.length === 0) {
    return null;
  }

  const now = new Date().toISOString();

  return {
    id: integration?.id ?? `${platform}-messaging-config-default`,
    profileId,
    platform,
    source: "database" as const,
    enabled: integration?.enabled ?? false,
    botToken: integration?.botToken ?? "",
    appId: integration?.appId ?? "",
    appSecret: integration?.appSecret ?? "",
    publicKey: integration?.publicKey ?? "",
    webhookSecret: integration?.webhookSecret ?? "",
    baseUrl: integration?.baseUrl ?? "",
    metadata: integration?.metadata ?? {},
    targets,
    createdAt: integration?.createdAt ?? now,
    updatedAt: integration?.updatedAt ?? now,
  } satisfies StoredMessagingPlatformConfig;
});

export const upsertMessagingPlatformConfig = Effect.fnUntraced(function* (
  profileId: string,
  platform: MessagingPlatform,
  input: MessagingPlatformConfigInput
) {
  const existing = yield* getStoredMessagingIntegration(profileId, platform);
  const now = new Date().toISOString();
  const normalizedBotToken = normalizeOptional(input.botToken);
  const normalizedAppId = normalizeOptional(input.appId);
  const normalizedAppSecret = normalizeOptional(input.appSecret);
  const normalizedPublicKey = normalizeOptional(input.publicKey);
  const normalizedWebhookSecret = normalizeOptional(input.webhookSecret);
  const normalizedBaseUrl = normalizeOptional(input.baseUrl);
  const metadataJson = JSON.stringify(input.metadata);

  if (existing) {
    yield* fromPromise("upsertMessagingPlatformConfig", () =>
      db
        .update(messagingIntegrationsTable)
        .set({
          enabled: input.enabled,
          botToken: normalizedBotToken,
          appId: normalizedAppId,
          appSecret: normalizedAppSecret,
          publicKey: normalizedPublicKey,
          webhookSecret: normalizedWebhookSecret,
          baseUrl: normalizedBaseUrl,
          metadataJson,
          updatedAt: now,
        })
        .where(eq(messagingIntegrationsTable.id, existing.id))
    );
  } else {
    yield* fromPromise("upsertMessagingPlatformConfig", () =>
      db.insert(messagingIntegrationsTable).values({
        id: crypto.randomUUID(),
        profileId,
        platform,
        enabled: input.enabled,
        botToken: normalizedBotToken,
        appId: normalizedAppId,
        appSecret: normalizedAppSecret,
        publicKey: normalizedPublicKey,
        webhookSecret: normalizedWebhookSecret,
        baseUrl: normalizedBaseUrl,
        metadataJson,
        createdAt: now,
        updatedAt: now,
      })
    );
  }

  yield* fromPromise("upsertMessagingPlatformConfig", () =>
    db
      .delete(messagingTargetsTable)
      .where(
        and(
          eq(messagingTargetsTable.profileId, profileId),
          eq(messagingTargetsTable.platform, platform)
        )
      )
  );

  if (input.targets.length > 0) {
    yield* fromPromise("upsertMessagingPlatformConfig", () =>
      db.insert(messagingTargetsTable).values(
        input.targets.map((target) => ({
          id: crypto.randomUUID(),
          profileId,
          platform,
          alias: target.alias,
          label: target.label,
          targetType: target.targetType,
          targetId: target.targetId,
          enabled: target.enabled,
          metadataJson: JSON.stringify(target.metadata),
          createdAt: now,
          updatedAt: now,
        }))
      )
    );
  }

  return yield* getStoredMessagingPlatformConfig(profileId, platform);
});

export const createExternalConversationBinding = Effect.fnUntraced(
  function* (input: {
    profileId: string;
    platform: MessagingPlatform;
    scopeType: ExternalConversationScopeType;
    scopeKey: string;
    conversationId: string;
  }) {
    const existing = yield* getExternalConversationBinding(input);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(),
      profileId: input.profileId,
      platform: input.platform,
      scopeType: input.scopeType,
      scopeKey: input.scopeKey,
      conversationId: input.conversationId,
      lastInboundAt: null,
      createdAt: now,
      updatedAt: now,
    };

    yield* fromPromise("createExternalConversationBinding", () =>
      db.insert(externalConversationBindingsTable).values(record)
    );
    return toExternalConversationBinding(record);
  }
);

export const getExternalConversationBinding = Effect.fnUntraced(
  function* (input: {
    profileId: string;
    platform: MessagingPlatform;
    scopeType: ExternalConversationScopeType;
    scopeKey: string;
  }) {
    const row = yield* fromPromise(
      "getExternalConversationBinding",
      async () => {
        try {
          return await db.query.externalConversationBindingsTable.findFirst({
            where: {
              profileId: input.profileId,
              platform: input.platform,
              scopeType: input.scopeType,
              scopeKey: input.scopeKey,
            },
          });
        } catch {
          return null;
        }
      }
    );

    return row ? toExternalConversationBinding(row) : null;
  }
);

export const touchExternalConversationBinding = Effect.fnUntraced(
  function* (input: {
    profileId: string;
    platform: MessagingPlatform;
    scopeType: ExternalConversationScopeType;
    scopeKey: string;
    lastInboundAt: string;
  }) {
    const existing = yield* getExternalConversationBinding(input);
    if (!existing) {
      return null;
    }

    yield* fromPromise("touchExternalConversationBinding", () =>
      db
        .update(externalConversationBindingsTable)
        .set({
          lastInboundAt: input.lastInboundAt,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(externalConversationBindingsTable.id, existing.id))
    );

    return yield* getExternalConversationBinding(input);
  }
);

export const recordExternalEventReceipt = Effect.fnUntraced(function* (input: {
  profileId: string;
  platform: MessagingPlatform;
  eventId: string;
}) {
  const existing = yield* fromPromise("recordExternalEventReceipt", () =>
    db.query.externalEventReceiptsTable.findFirst({
      where: {
        profileId: input.profileId,
        platform: input.platform,
        eventId: input.eventId,
      },
    })
  );

  if (existing) {
    return {
      inserted: false as const,
      receipt: toExternalEventReceipt(existing),
    };
  }

  const record = {
    id: crypto.randomUUID(),
    profileId: input.profileId,
    platform: input.platform,
    eventId: input.eventId,
    receivedAt: new Date().toISOString(),
  };

  yield* fromPromise("recordExternalEventReceipt", () =>
    db.insert(externalEventReceiptsTable).values(record)
  );

  return {
    inserted: true as const,
    receipt: toExternalEventReceipt(record),
  };
});

export type {
  ExternalConversationScopeType,
  StoredExternalConversationBinding,
  StoredExternalEventReceipt,
  StoredMessagingIntegration,
  StoredMessagingPlatformConfig,
  StoredMessagingTarget,
};
