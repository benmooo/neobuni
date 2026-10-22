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
import { listMessages } from "./messages";

let testDatabase: TestDatabase;

const resetTables = () =>
	executeStatements([
		"DELETE FROM messages",
		"DELETE FROM runtime_turns",
		"DELETE FROM conversations",
		"DELETE FROM profiles",
		"DELETE FROM `user`",
	]);

const seedConversation = async () => {
	const client = getClient();
	const now = Date.now();

	await client.execute({
		sql: "INSERT INTO `user` (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
		args: [
			"user-1",
			"Messages Test User",
			"messages-test@example.com",
			now,
			now,
		],
	});

	await client.execute({
		sql: "INSERT INTO profiles (id, owner_user_id, name, kind, timezone, archived_at, created_at, updated_at) VALUES (?, ?, ?, 'personal', ?, NULL, ?, ?)",
		args: [
			"profile-1",
			"user-1",
			"Messages Test Profile",
			"Asia/Shanghai",
			"2026-05-01T00:00:00.000Z",
			"2026-05-01T00:00:00.000Z",
		],
	});

	await client.execute({
		sql: "INSERT INTO conversations (id, profile_id, title, model_key, hidden, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		args: [
			"conversation-1",
			"profile-1",
			"Test Conversation",
			"gpt-5",
			0,
			"active",
			"2026-05-01T00:00:00.000Z",
			"2026-05-01T00:00:00.000Z",
		],
	});
};

describe("messages repo", () => {
	beforeAll(async () => {
		testDatabase = await setupTestDatabase("messages");
	});

	beforeEach(async () => {
		await resetTables();
		await seedConversation();
	});

	afterAll(() => {
		testDatabase.cleanup();
	});

	test("lists conversation messages with plain sqlite-compatible queries", async () => {
		const client = getClient();

		await client.execute({
			sql: "INSERT INTO messages (id, conversation_id, turn_id, role, kind, content, metadata_json, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)",
			args: [
				"message-1",
				"conversation-1",
				"user",
				"text",
				"hello",
				JSON.stringify({ source: "manual" }),
				"2026-05-01T00:00:00.000Z",
			],
		});
		await client.execute({
			sql: "INSERT INTO messages (id, conversation_id, turn_id, role, kind, content, metadata_json, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)",
			args: [
				"message-2",
				"conversation-1",
				"assistant",
				"generated",
				"world",
				JSON.stringify({ source: "assistant" }),
				"2026-05-01T00:01:00.000Z",
			],
		});

		const messages = await runRepo(listMessages("conversation-1"));

		expect(messages).toHaveLength(2);
		expect(messages.map((message) => message.id)).toEqual([
			"message-1",
			"message-2",
		]);
		expect(messages[0]?.metadata).toEqual({ source: "manual" });
		expect(messages[1]?.content).toBe("world");
	});
});
