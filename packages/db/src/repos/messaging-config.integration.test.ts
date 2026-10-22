import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";

import { getClient } from "../client";
import { runRepo } from "../run";
import {
  executeStatements,
  setupTestDatabase,
  type TestDatabase,
} from "../testing/test-database";
import { getStoredFeishuConfig, upsertFeishuConfig } from "./feishu-config";
import {
  createExternalConversationBinding,
  getExternalConversationBinding,
  getMessagingIntegrationByPlatformAppId,
  getMessagingIntegrationByWebhookSecret,
  getStoredMessagingPlatformConfig,
  listStoredMessagingTargets,
  recordExternalEventReceipt,
  touchExternalConversationBinding,
  upsertMessagingPlatformConfig,
} from "./messaging-config";
import { getStoredQqConfig, upsertQqConfig } from "./qq-config";

let testDatabase: TestDatabase;

const resetTables = () =>
  executeStatements([
    "DELETE FROM external_event_receipts",
    "DELETE FROM external_conversation_bindings",
    "DELETE FROM messaging_targets",
    "DELETE FROM messaging_integrations",
    "DELETE FROM conversations",
    "DELETE FROM profiles",
    "DELETE FROM `user`",
  ]);

const seedProfile = async () => {
  const client = getClient();
  const now = Date.now();

  await client.execute({
    sql: "INSERT INTO `user` (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
    args: [
      "user-1",
      "Messaging Test User",
      "messaging-test@example.com",
      now,
      now,
    ],
  });

  await client.execute({
    sql: "INSERT INTO profiles (id, owner_user_id, name, kind, timezone, archived_at, created_at, updated_at) VALUES (?, ?, ?, 'personal', ?, NULL, ?, ?)",
    args: [
      "profile-1",
      "user-1",
      "Messaging Test Profile",
      "Asia/Shanghai",
      "2026-06-15T00:00:00.000Z",
      "2026-06-15T00:00:00.000Z",
    ],
  });

  await client.execute({
    sql: "INSERT INTO conversations (id, profile_id, title, model_key, hidden, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      "conversation-1",
      "profile-1",
      "Discord Friends Room",
      "gpt-5",
      0,
      "active",
      "2026-06-15T00:00:00.000Z",
      "2026-06-15T00:00:00.000Z",
    ],
  });
};

describe("messaging-config repo", () => {
  beforeAll(async () => {
    testDatabase = await setupTestDatabase("messaging-config");
  });

  beforeEach(async () => {
    await resetTables();
    await seedProfile();
  });

  afterAll(() => {
    testDatabase.cleanup();
  });

  test("upserts and reloads discord messaging config with targets", async () => {
    const stored = await runRepo(
      upsertMessagingPlatformConfig("profile-1", "discord", {
        enabled: true,
        botToken: "discord_bot_token_123",
        appId: "discord_app_123",
        publicKey: "a".repeat(64),
        webhookSecret: "",
        metadata: {
          install: "manual",
        },
        targets: [
          {
            alias: "friends_room",
            label: "Friends Room",
            targetType: "channel",
            targetId: "123456789012345678",
            enabled: true,
            metadata: {
              guildId: "guild-1",
            },
          },
        ],
      })
    );

    const reloaded = await runRepo(
      getStoredMessagingPlatformConfig("profile-1", "discord")
    );
    const storedTargets = await runRepo(
      listStoredMessagingTargets("profile-1", "discord")
    );
    const byAppId = await runRepo(
      getMessagingIntegrationByPlatformAppId("discord", "discord_app_123")
    );

    expect(stored?.enabled).toBe(true);
    expect(reloaded?.appId).toBe("discord_app_123");
    expect(reloaded?.targets).toHaveLength(1);
    expect(storedTargets).toEqual([
      {
        platform: "discord",
        alias: "friends_room",
        label: "Friends Room",
        targetType: "channel",
        targetId: "123456789012345678",
        enabled: true,
        metadata: {
          guildId: "guild-1",
        },
      },
    ]);
    expect(byAppId?.profileId).toBe("profile-1");
    expect(byAppId?.platform).toBe("discord");
  });

  test("upserts and reloads telegram messaging config with webhook lookup", async () => {
    const stored = await runRepo(
      upsertMessagingPlatformConfig("profile-1", "telegram", {
        enabled: true,
        botToken: "telegram_bot_token_123",
        appId: "",
        publicKey: "",
        webhookSecret: "telegram-secret",
        metadata: {
          botUsername: "buni_bot",
        },
        targets: [
          {
            alias: "friends_group",
            label: "Friends Group",
            targetType: "supergroup",
            targetId: "-1001234567890",
            enabled: true,
            metadata: {},
          },
        ],
      })
    );

    const reloaded = await runRepo(
      getStoredMessagingPlatformConfig("profile-1", "telegram")
    );
    const byWebhookSecret = await runRepo(
      getMessagingIntegrationByWebhookSecret("telegram", "telegram-secret")
    );

    expect(stored?.enabled).toBe(true);
    expect(reloaded?.webhookSecret).toBe("telegram-secret");
    expect(reloaded?.targets).toHaveLength(1);
    expect(reloaded?.targets[0]).toMatchObject({
      platform: "telegram",
      alias: "friends_group",
      targetId: "-1001234567890",
    });
    expect(byWebhookSecret?.profileId).toBe("profile-1");
    expect(byWebhookSecret?.platform).toBe("telegram");
  });

  test("bridges feishu config through generic messaging storage", async () => {
    const stored = await runRepo(
      upsertFeishuConfig("profile-1", {
        enabled: true,
        appId: "feishu_app_123",
        appSecret: "feishu_secret_123",
        baseUrl: "https://open.feishu.cn/open-apis",
        targets: [
          {
            alias: "daily_sync",
            label: "Daily Sync",
            receiveIdType: "chat_id",
            receiveId: "oc_test_chat",
            enabled: true,
          },
        ],
      })
    );

    const reloaded = await runRepo(getStoredFeishuConfig("profile-1"));
    const generic = await runRepo(
      getStoredMessagingPlatformConfig("profile-1", "feishu")
    );

    expect(stored?.appId).toBe("feishu_app_123");
    expect(reloaded?.appSecret).toBe("feishu_secret_123");
    expect(reloaded?.targets).toEqual([
      {
        alias: "daily_sync",
        label: "Daily Sync",
        receiveIdType: "chat_id",
        receiveId: "oc_test_chat",
        enabled: true,
      },
    ]);
    expect(generic?.platform).toBe("feishu");
    expect(generic?.appId).toBe("feishu_app_123");
    expect(generic?.appSecret).toBe("feishu_secret_123");
    expect(generic?.baseUrl).toBe("https://open.feishu.cn/open-apis");
    expect(generic?.targets).toEqual([
      {
        platform: "feishu",
        alias: "daily_sync",
        label: "Daily Sync",
        targetType: "chat_id",
        targetId: "oc_test_chat",
        enabled: true,
        metadata: {},
      },
    ]);
  });

  test("bridges qq config through generic messaging storage", async () => {
    const stored = await runRepo(
      upsertQqConfig("profile-1", {
        enabled: true,
        appId: "qq_app_123",
        appSecret: "qq_secret_123",
        baseUrl: "https://api.sgroup.qq.com",
        targets: [
          {
            alias: "family_group",
            label: "Family Group",
            targetType: "group_openid",
            targetId: "group_openid_123",
            enabled: true,
          },
        ],
      })
    );

    const reloaded = await runRepo(getStoredQqConfig("profile-1"));
    const generic = await runRepo(
      getStoredMessagingPlatformConfig("profile-1", "qq")
    );

    expect(stored?.appId).toBe("qq_app_123");
    expect(reloaded?.appSecret).toBe("qq_secret_123");
    expect(reloaded?.targets).toEqual([
      {
        alias: "family_group",
        label: "Family Group",
        targetType: "group_openid",
        targetId: "group_openid_123",
        enabled: true,
      },
    ]);
    expect(generic?.platform).toBe("qq");
    expect(generic?.appId).toBe("qq_app_123");
    expect(generic?.appSecret).toBe("qq_secret_123");
    expect(generic?.baseUrl).toBe("https://api.sgroup.qq.com");
    expect(generic?.targets).toEqual([
      {
        platform: "qq",
        alias: "family_group",
        label: "Family Group",
        targetType: "group_openid",
        targetId: "group_openid_123",
        enabled: true,
        metadata: {},
      },
    ]);
  });

  test("creates and touches an external conversation binding", async () => {
    const created = await runRepo(
      createExternalConversationBinding({
        profileId: "profile-1",
        platform: "discord",
        scopeType: "guild_channel",
        scopeKey: "guild-1:channel-1",
        conversationId: "conversation-1",
      })
    );

    const touched = await runRepo(
      touchExternalConversationBinding({
        profileId: "profile-1",
        platform: "discord",
        scopeType: "guild_channel",
        scopeKey: "guild-1:channel-1",
        lastInboundAt: "2026-06-15T00:10:00.000Z",
      })
    );
    const reloaded = await runRepo(
      getExternalConversationBinding({
        profileId: "profile-1",
        platform: "discord",
        scopeType: "guild_channel",
        scopeKey: "guild-1:channel-1",
      })
    );

    expect(created.conversationId).toBe("conversation-1");
    expect(touched?.lastInboundAt).toBe("2026-06-15T00:10:00.000Z");
    expect(reloaded?.scopeKey).toBe("guild-1:channel-1");
  });

  test("records event receipts once per profile platform and event id", async () => {
    const first = await runRepo(
      recordExternalEventReceipt({
        profileId: "profile-1",
        platform: "discord",
        eventId: "interaction-1",
      })
    );
    const second = await runRepo(
      recordExternalEventReceipt({
        profileId: "profile-1",
        platform: "discord",
        eventId: "interaction-1",
      })
    );

    expect(first.inserted).toBe(true);
    expect(first.receipt.eventId).toBe("interaction-1");
    expect(second.inserted).toBe(false);
    expect(second.receipt.eventId).toBe("interaction-1");
  });
});
