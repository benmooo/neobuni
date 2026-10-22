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
import {
  createConversation,
  getConversation,
  listConversations,
} from "./conversations";

let testDatabase: TestDatabase;

const resetTables = () =>
  executeStatements([
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
      "Conversations Test User",
      "conversations-test@example.com",
      now,
      now,
    ],
  });

  await client.execute({
    sql: "INSERT INTO profiles (id, owner_user_id, name, kind, timezone, archived_at, created_at, updated_at) VALUES (?, ?, ?, 'personal', ?, NULL, ?, ?)",
    args: [
      "profile-1",
      "user-1",
      "Conversations Test Profile",
      "Asia/Shanghai",
      "2026-06-15T00:00:00.000Z",
      "2026-06-15T00:00:00.000Z",
    ],
  });
};

describe("conversations repo", () => {
  beforeAll(async () => {
    testDatabase = await setupTestDatabase("conversations");
  });

  beforeEach(async () => {
    await resetTables();
    await seedProfile();
  });

  afterAll(() => {
    testDatabase.cleanup();
  });

  test("hides internal conversations from default reads", async () => {
    const hiddenConversation = await runRepo(
      createConversation("profile-1", {
        title: "[telegram] -1001234567890",
        modelKey: "default",
        hidden: true,
      })
    );
    const visibleConversation = await runRepo(
      createConversation("profile-1", {
        title: "Visible Chat",
        modelKey: "default",
      })
    );

    const visibleList = await runRepo(listConversations("profile-1"));
    const hiddenByDefault = await runRepo(
      getConversation(hiddenConversation.id)
    );
    const hiddenIncluded = await runRepo(
      getConversation(hiddenConversation.id, {
        includeHidden: true,
      })
    );
    const fullList = await runRepo(
      listConversations("profile-1", {
        includeHidden: true,
      })
    );

    expect(visibleList.some((item) => item.id === visibleConversation.id)).toBe(
      true
    );
    expect(visibleList.some((item) => item.id === hiddenConversation.id)).toBe(
      false
    );
    expect(hiddenByDefault).toBeNull();
    expect(hiddenIncluded).toMatchObject({
      id: hiddenConversation.id,
      hidden: true,
    });
    expect(fullList.some((item) => item.id === hiddenConversation.id)).toBe(
      true
    );
  });
});
