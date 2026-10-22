import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendEvent as appendEventEffect,
  configureDatabase,
  getClient,
  runRepo,
} from "@neobuni/db";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "neobuni-feishu-tool-suite-"));
const dbFile = join(tempDir, "feishu-tool-suite.sqlite");

process.env.DATABASE_URL = `file:${dbFile}`;

const originalEnv = {
  appId: process.env.NEOBUNI_FEISHU_APP_ID,
  appSecret: process.env.NEOBUNI_FEISHU_APP_SECRET,
  baseUrl: process.env.NEOBUNI_FEISHU_BASE_URL,
  targetsJson: process.env.NEOBUNI_FEISHU_TARGETS_JSON,
};

let listFeishuDeliveryLogsFromRequest: typeof import("./feishu-tool-suite")["listFeishuDeliveryLogsFromRequest"];
let listFeishuTargetsFromRequest: typeof import("./feishu-tool-suite")["listFeishuTargetsFromRequest"];

const createTables = async () => {
  const client = getClient();

  await client.batch(
    [
      `CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        email_verified INTEGER NOT NULL DEFAULT 0,
        image TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT REFERENCES user(id) ON DELETE CASCADE ON UPDATE CASCADE,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'personal',
        timezone TEXT,
        archived_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS messaging_integrations (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
        platform TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        bot_token TEXT NOT NULL DEFAULT '',
        app_id TEXT,
        app_secret TEXT,
        public_key TEXT,
        webhook_secret TEXT,
        base_url TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS messaging_targets (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
        platform TEXT NOT NULL,
        alias TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ],
    "write"
  );
};

const resetTables = async () => {
  await getClient().batch(
    [
      "DELETE FROM messaging_targets",
      "DELETE FROM messaging_integrations",
      "DELETE FROM events",
      "DELETE FROM profiles",
      "DELETE FROM user",
    ],
    "write"
  );
};

const insertProfile = async (profileId: string) => {
  const client = getClient();
  const userId = `user-${profileId}`;

  await client.execute({
    sql: "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
    args: [
      userId,
      "Feishu Tool User",
      `${profileId}@example.com`,
      Date.now(),
      Date.now(),
    ],
  });
  await client.execute({
    sql: "INSERT INTO profiles (id, owner_user_id, name, kind, timezone, archived_at, created_at, updated_at) VALUES (?, ?, ?, 'personal', 'Asia/Shanghai', NULL, ?, ?)",
    args: [
      profileId,
      userId,
      `Profile ${profileId}`,
      "2026-05-01T00:00:00.000Z",
      "2026-05-01T00:00:00.000Z",
    ],
  });
};

const insertFeishuTarget = async (input: {
  profileId: string;
  alias: string;
  label: string;
  receiveIdType: string;
  receiveId: string;
  enabled?: boolean;
}) => {
  await getClient().execute({
    sql: "INSERT INTO messaging_targets (id, profile_id, platform, alias, label, target_type, target_id, enabled, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      crypto.randomUUID(),
      input.profileId,
      "feishu",
      input.alias,
      input.label,
      input.receiveIdType,
      input.receiveId,
      (input.enabled ?? true) ? 1 : 0,
      "{}",
      "2026-05-01T00:00:00.000Z",
      "2026-05-01T00:00:00.000Z",
    ],
  });
};

describe("feishu tool suite", () => {
  beforeAll(async () => {
    configureDatabase({ url: `file:${dbFile}` });
    await createTables();

    const toolSuiteModule = await import("./feishu-tool-suite");
    listFeishuDeliveryLogsFromRequest =
      toolSuiteModule.listFeishuDeliveryLogsFromRequest;
    listFeishuTargetsFromRequest = toolSuiteModule.listFeishuTargetsFromRequest;
  });

  beforeEach(async () => {
    await resetTables();
    await insertProfile("profile-feishu-tool-suite-1");
    process.env.NEOBUNI_FEISHU_APP_ID = "cli_test_app";
    process.env.NEOBUNI_FEISHU_APP_SECRET = "cli_test_secret";
    process.env.NEOBUNI_FEISHU_BASE_URL =
      "https://feishu.example.com/open-apis";
    process.env.NEOBUNI_FEISHU_TARGETS_JSON = JSON.stringify({
      daily_sync: {
        label: "Daily Sync Group",
        receiveIdType: "chat_id",
        receiveId: "oc_test_chat",
      },
    });
  });

  afterEach(() => {
    process.env.NEOBUNI_FEISHU_APP_ID = originalEnv.appId;
    process.env.NEOBUNI_FEISHU_APP_SECRET = originalEnv.appSecret;
    process.env.NEOBUNI_FEISHU_BASE_URL = originalEnv.baseUrl;
    process.env.NEOBUNI_FEISHU_TARGETS_JSON = originalEnv.targetsJson;
  });

  test("lists configured Feishu targets with redacted ids", async () => {
    const result = await listFeishuTargetsFromRequest({
      profileId: "profile-feishu-tool-suite-1",
    });

    expect(result.count).toBe(1);
    expect(result.items[0]?.alias).toBe("daily_sync");
    expect(result.items[0]?.receiveIdPreview).toContain("...");
  });

  test("lists DB-backed targets even when app credentials are absent", async () => {
    process.env.NEOBUNI_FEISHU_APP_ID = "";
    process.env.NEOBUNI_FEISHU_APP_SECRET = "";
    process.env.NEOBUNI_FEISHU_BASE_URL = "";
    process.env.NEOBUNI_FEISHU_TARGETS_JSON = "";

    await insertFeishuTarget({
      profileId: "profile-feishu-tool-suite-1",
      alias: "db_daily_sync",
      label: "DB Daily Sync",
      receiveIdType: "chat_id",
      receiveId: "oc_db_chat",
    });

    const result = await listFeishuTargetsFromRequest({
      profileId: "profile-feishu-tool-suite-1",
    });

    expect(result.count).toBe(1);
    expect(result.items[0]?.alias).toBe("db_daily_sync");
    expect(result.items[0]?.label).toBe("DB Daily Sync");
  });

  test("lists Feishu delivery logs from events", async () => {
    await runRepo(
      appendEventEffect(
        "profile-feishu-tool-suite-1",
        "tool.send_feishu_message",
        {
          targetAlias: "daily_sync",
          receiveIdType: "chat_id",
          receiveId: "oc_test_chat",
          messageId: "om_message_123",
          preview: "Reflection report ready",
          conversationId: "conversation-1",
          turnId: "turn-1",
        }
      )
    );

    const result = await listFeishuDeliveryLogsFromRequest({
      profileId: "profile-feishu-tool-suite-1",
      request: {
        limit: 10,
      },
    });

    expect(result.count).toBe(1);
    expect(result.items[0]?.targetAlias).toBe("daily_sync");
    expect(result.items[0]?.receiveIdPreview).toContain("...");
    expect(result.items[0]?.messageId).toBe("om_message_123");
  });
});
