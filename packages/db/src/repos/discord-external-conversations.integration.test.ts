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
import { getConversation, listConversations } from "./conversations";
import { resolveDiscordExternalConversationWindow } from "./discord-external-conversations";
import { listMessages } from "./messages";
import { getExternalConversationBinding } from "./messaging-config";

let testDatabase: TestDatabase;

const resetTables = () =>
	executeStatements([
		"DELETE FROM external_conversation_bindings",
		"DELETE FROM messages",
		"DELETE FROM runtime_turns",
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
			"Discord External Conversation User",
			"discord-window-test@example.com",
			now,
			now,
		],
	});

	await client.execute({
		sql: "INSERT INTO profiles (id, owner_user_id, name, kind, timezone, archived_at, created_at, updated_at) VALUES (?, ?, ?, 'personal', ?, NULL, ?, ?)",
		args: [
			"profile-1",
			"user-1",
			"Discord External Conversation Profile",
			"Asia/Shanghai",
			"2026-07-02T08:00:00.000Z",
			"2026-07-02T08:00:00.000Z",
		],
	});
};

const seedConversation = async (input?: {
	id?: string;
	hidden?: number;
	status?: string;
}) => {
	const id = input?.id ?? "conversation-1";

	await getClient().execute({
		sql: "INSERT INTO conversations (id, profile_id, title, model_key, hidden, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		args: [
			id,
			"profile-1",
			"[discord] guild-1:channel-1",
			"default",
			input?.hidden ?? 1,
			input?.status ?? "active",
			"2026-07-02T08:00:00.000Z",
			"2026-07-02T08:00:00.000Z",
		],
	});

	return id;
};

const seedBinding = async (conversationId: string) => {
	await getClient().execute({
		sql: "INSERT INTO external_conversation_bindings (id, profile_id, platform, scope_type, scope_key, conversation_id, last_inbound_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		args: [
			"binding-1",
			"profile-1",
			"discord",
			"guild_channel",
			"guild-1:channel-1",
			conversationId,
			"2026-07-02T08:00:00.000Z",
			"2026-07-02T08:00:00.000Z",
			"2026-07-02T08:00:00.000Z",
		],
	});
};

const seedMessage = async (input: {
	id: string;
	conversationId: string;
	role: "system" | "user" | "assistant" | "tool";
	kind: "text" | "generated" | "event" | "tool_result";
	content: string;
	createdAt: string;
}) => {
	await getClient().execute({
		sql: "INSERT INTO messages (id, conversation_id, turn_id, role, kind, content, metadata_json, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)",
		args: [
			input.id,
			input.conversationId,
			input.role,
			input.kind,
			input.content,
			JSON.stringify({ source: "seed" }),
			input.createdAt,
		],
	});
};

describe("discord external conversations repo", () => {
	beforeAll(async () => {
		testDatabase = await setupTestDatabase("discord-external-conversations");
	});

	beforeEach(async () => {
		await resetTables();
		await seedProfile();
	});

	afterAll(() => {
		testDatabase.cleanup();
	});

	test("creates the first hidden discord window when no binding exists", async () => {
		const result = await runRepo(
			resolveDiscordExternalConversationWindow({
				profileId: "profile-1",
				scopeKey: "guild-1:channel-1",
				now: "2026-07-02T09:00:00.000Z",
			})
		);

		const binding = await runRepo(
			getExternalConversationBinding({
				profileId: "profile-1",
				platform: "discord",
				scopeType: "guild_channel",
				scopeKey: "guild-1:channel-1",
			})
		);
		const conversation = await runRepo(
			getConversation(result.conversationId, {
				includeHidden: true,
			})
		);

		expect(result).toMatchObject({
			lifecycle: "created",
			rolloverReason: null,
			previousConversationId: null,
		});
		expect(binding?.conversationId).toBe(result.conversationId);
		expect(binding?.lastInboundAt).toBe("2026-07-02T09:00:00.000Z");
		expect(conversation).toMatchObject({
			id: result.conversationId,
			hidden: true,
			status: "active",
			title: "[discord] guild-1:channel-1",
		});
	});

	test("reuses the active discord window when no rollover threshold is reached", async () => {
		const conversationId = await seedConversation();
		await seedBinding(conversationId);
		await seedMessage({
			id: "message-1",
			conversationId,
			role: "user",
			kind: "text",
			content: "hello",
			createdAt: "2026-07-02T08:00:00.000Z",
		});

		const result = await runRepo(
			resolveDiscordExternalConversationWindow({
				profileId: "profile-1",
				scopeKey: "guild-1:channel-1",
				now: "2026-07-02T08:05:00.000Z",
			})
		);

		expect(result).toMatchObject({
			lifecycle: "reused",
			conversationId,
			rolloverReason: null,
			previousConversationId: null,
		});
	});

	test("rolls over an existing discord window, seeds the tail, and rebinds the scope", async () => {
		const conversationId = await seedConversation();
		await seedBinding(conversationId);
		await seedMessage({
			id: "message-1",
			conversationId,
			role: "system",
			kind: "text",
			content: "system prompt",
			createdAt: "2026-07-02T08:00:00.000Z",
		});
		await seedMessage({
			id: "message-2",
			conversationId,
			role: "user",
			kind: "text",
			content: "u1",
			createdAt: "2026-07-02T08:01:00.000Z",
		});
		await seedMessage({
			id: "message-3",
			conversationId,
			role: "assistant",
			kind: "generated",
			content: "a1",
			createdAt: "2026-07-02T08:02:00.000Z",
		});
		await seedMessage({
			id: "message-4",
			conversationId,
			role: "user",
			kind: "text",
			content: "u2",
			createdAt: "2026-07-02T08:03:00.000Z",
		});

		const result = await runRepo(
			resolveDiscordExternalConversationWindow({
				profileId: "profile-1",
				scopeKey: "guild-1:channel-1",
				now: "2026-07-02T08:10:00.000Z",
				limits: {
					maxWindowMessageCount: 3,
					maxWindowEstimatedTokens: 24_000,
					maxWindowIdleMs: 72 * 60 * 60 * 1000,
					seedMessageCount: 2,
				},
			})
		);

		const reloadedBinding = await runRepo(
			getExternalConversationBinding({
				profileId: "profile-1",
				platform: "discord",
				scopeType: "guild_channel",
				scopeKey: "guild-1:channel-1",
			})
		);
		const oldConversation = await runRepo(
			getConversation(conversationId, {
				includeHidden: true,
			})
		);
		const newConversation = await runRepo(
			getConversation(result.conversationId, {
				includeHidden: true,
			})
		);
		const seededMessages = await runRepo(listMessages(result.conversationId));

		expect(result.lifecycle).toBe("rolled_over");
		expect(result.previousConversationId).toBe(conversationId);
		expect(result.rolloverReason).toBe("message_count");
		expect(result.conversationId).not.toBe(conversationId);
		expect(reloadedBinding?.conversationId).toBe(result.conversationId);
		expect(reloadedBinding?.lastInboundAt).toBe("2026-07-02T08:10:00.000Z");
		expect(oldConversation?.status).toBe("archived");
		expect(newConversation).toMatchObject({
			id: result.conversationId,
			hidden: true,
			status: "active",
		});
		expect(seededMessages).toHaveLength(2);
		expect(seededMessages.map((message) => message.content)).toEqual([
			"a1",
			"u2",
		]);
		expect(seededMessages[0]?.metadata).toMatchObject({
			rollover: {
				kind: "seed_copy",
				sourceConversationId: conversationId,
				sourceMessageId: "message-3",
			},
		});
	});

	test("repairs a stale binding when it points at an archived conversation", async () => {
		const conversationId = await seedConversation({
			status: "archived",
		});
		await seedBinding(conversationId);

		const result = await runRepo(
			resolveDiscordExternalConversationWindow({
				profileId: "profile-1",
				scopeKey: "guild-1:channel-1",
				now: "2026-07-02T09:00:00.000Z",
			})
		);

		const reloadedBinding = await runRepo(
			getExternalConversationBinding({
				profileId: "profile-1",
				platform: "discord",
				scopeType: "guild_channel",
				scopeKey: "guild-1:channel-1",
			})
		);
		const allConversations = await runRepo(
			listConversations("profile-1", {
				includeHidden: true,
			})
		);

		expect(result).toMatchObject({
			lifecycle: "repaired",
			previousConversationId: conversationId,
			rolloverReason: null,
		});
		expect(reloadedBinding?.conversationId).toBe(result.conversationId);
		expect(allConversations).toHaveLength(2);
	});
});
