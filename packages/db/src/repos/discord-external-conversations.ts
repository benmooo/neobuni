import { idSchema, isoDateTimeSchema } from "@neobuni/contracts";
import { makeConversation, makeMessage } from "@neobuni/core";
import { Effect } from "effect";
import { z } from "zod";

import { db, fromPromise, getClient } from "../client";
import {
	DISCORD_EXTERNAL_CONVERSATION_ROLLOVER_LIMITS,
	type DiscordExternalConversationRolloverLimits,
	type DiscordExternalConversationRolloverReason,
	decideDiscordExternalConversationRollover,
	estimateDiscordExternalConversationTokens,
	selectDiscordExternalConversationSeedMessages,
} from "./discord-external-conversation-rollover";

const resolveDiscordExternalConversationWindowLifecycleSchema = z.enum([
	"created",
	"reused",
	"rolled_over",
	"repaired",
]);

const resolveDiscordExternalConversationWindowInputSchema = z.object({
	profileId: idSchema,
	scopeKey: z.string().trim().min(1),
	now: isoDateTimeSchema.optional(),
	limits: z
		.object({
			maxWindowMessageCount: z.number().int().min(1).optional(),
			maxWindowEstimatedTokens: z.number().int().min(1).optional(),
			maxWindowIdleMs: z.number().int().min(1).optional(),
			seedMessageCount: z.number().int().min(0).optional(),
		})
		.optional(),
});

const resolveDiscordExternalConversationWindowResultSchema = z.object({
	conversationId: idSchema,
	lifecycle: resolveDiscordExternalConversationWindowLifecycleSchema,
	rolloverReason: z
		.enum(["message_count", "estimated_tokens", "idle"])
		.nullable(),
	previousConversationId: idSchema.nullable(),
});

type ResolveDiscordExternalConversationWindowInput = z.infer<
	typeof resolveDiscordExternalConversationWindowInputSchema
>;
type ResolveDiscordExternalConversationWindowLifecycle = z.infer<
	typeof resolveDiscordExternalConversationWindowLifecycleSchema
>;
type ResolveDiscordExternalConversationWindowResult = z.infer<
	typeof resolveDiscordExternalConversationWindowResultSchema
>;

type DiscordExternalConversationBindingRow = {
	id: string;
	profile_id: string;
	scope_key: string;
	conversation_id: string;
	last_inbound_at: string | null;
	created_at: string;
	updated_at: string;
};

type DiscordConversationRow = {
	id: string;
	profile_id: string;
	title: string;
	model_key: string;
	hidden: number;
	status: string;
	created_at: string;
	updated_at: string;
};

type DiscordMessageRow = {
	id: string;
	conversation_id: string;
	turn_id: string | null;
	role: "system" | "user" | "assistant" | "tool";
	kind: "text" | "generated" | "event" | "tool_result";
	content: string;
	metadata_json: string;
	created_at: string;
};

const createConversationRecord = makeConversation();
const createMessageRecord = makeMessage();

const buildDiscordConversationTitle = (scopeKey: string) =>
	`[discord] ${scopeKey}`;

const parseJson = (value: string) => {
	try {
		return JSON.parse(value) as Record<string, unknown>;
	} catch {
		return {};
	}
};

const mergeDiscordRolloverLimits = (
	overrides?: ResolveDiscordExternalConversationWindowInput["limits"]
): DiscordExternalConversationRolloverLimits => ({
	...DISCORD_EXTERNAL_CONVERSATION_ROLLOVER_LIMITS,
	...(overrides ?? {}),
});

const readDiscordBinding = async (input: {
	profileId: string;
	scopeKey: string;
}): Promise<DiscordExternalConversationBindingRow | null> => {
	const { rows } = await getClient().execute({
		sql: `SELECT id, profile_id, scope_key, conversation_id, last_inbound_at, created_at, updated_at
       FROM external_conversation_bindings
       WHERE profile_id = ? AND platform = 'discord' AND scope_type = 'guild_channel' AND scope_key = ?
       LIMIT 1`,
		args: [input.profileId, input.scopeKey],
	});

	const [row] = rows;
	if (!row) {
		return null;
	}

	return {
		id: String(row.id),
		profile_id: String(row.profile_id),
		scope_key: String(row.scope_key),
		conversation_id: String(row.conversation_id),
		last_inbound_at:
			typeof row.last_inbound_at === "string" ? row.last_inbound_at : null,
		created_at: String(row.created_at),
		updated_at: String(row.updated_at),
	};
};

const readConversation = async (
	conversationId: string
): Promise<DiscordConversationRow | null> => {
	const { rows } = await getClient().execute({
		sql: `SELECT id, profile_id, title, model_key, hidden, status, created_at, updated_at
       FROM conversations
       WHERE id = ?
       LIMIT 1`,
		args: [conversationId],
	});

	const [row] = rows;
	if (!row) {
		return null;
	}

	return {
		id: String(row.id),
		profile_id: String(row.profile_id),
		title: String(row.title),
		model_key: String(row.model_key),
		hidden: Number(row.hidden),
		status: String(row.status),
		created_at: String(row.created_at),
		updated_at: String(row.updated_at),
	};
};

const readConversationMessages = async (
	conversationId: string
): Promise<DiscordMessageRow[]> => {
	const { rows } = await getClient().execute({
		sql: `SELECT id, conversation_id, turn_id, role, kind, content, metadata_json, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC`,
		args: [conversationId],
	});

	return rows.map((row) => ({
		id: String(row.id),
		conversation_id: String(row.conversation_id),
		turn_id: typeof row.turn_id === "string" ? row.turn_id : null,
		role: String(row.role) as DiscordMessageRow["role"],
		kind: String(row.kind) as DiscordMessageRow["kind"],
		content: String(row.content),
		metadata_json: String(row.metadata_json),
		created_at: String(row.created_at),
	}));
};

const buildConversationStats = (messages: DiscordMessageRow[]) => {
	const nonSystemMessages = messages.filter(
		(message) => message.role !== "system"
	);
	const totalContentChars = nonSystemMessages.reduce(
		(total, message) => total + message.content.length,
		0
	);

	return {
		messageCount: nonSystemMessages.length,
		totalContentChars,
		estimatedTokens:
			estimateDiscordExternalConversationTokens(totalContentChars),
		lastMessageAt: messages.at(-1)?.created_at ?? null,
	};
};

const insertConversation = async (input: {
	profileId: string;
	scopeKey: string;
	now: string;
}) => {
	const record = createConversationRecord({
		profileId: input.profileId,
		title: buildDiscordConversationTitle(input.scopeKey),
		modelKey: "default",
		hidden: true,
	});

	const nextRecord = {
		...record,
		createdAt: input.now,
		updatedAt: input.now,
	};

	await getClient().execute({
		sql: `INSERT INTO conversations (id, profile_id, title, model_key, hidden, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		args: [
			nextRecord.id,
			nextRecord.profileId,
			nextRecord.title,
			nextRecord.modelKey,
			nextRecord.hidden ? 1 : 0,
			nextRecord.status,
			nextRecord.createdAt,
			nextRecord.updatedAt,
		],
	});

	return nextRecord;
};

const insertBinding = async (input: {
	profileId: string;
	scopeKey: string;
	conversationId: string;
	now: string;
}) => {
	const record = {
		id: crypto.randomUUID(),
		profileId: input.profileId,
		platform: "discord",
		scopeType: "guild_channel",
		scopeKey: input.scopeKey,
		conversationId: input.conversationId,
		lastInboundAt: input.now,
		createdAt: input.now,
		updatedAt: input.now,
	};

	await getClient().execute({
		sql: `INSERT INTO external_conversation_bindings (
         id, profile_id, platform, scope_type, scope_key, conversation_id, last_inbound_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		args: [
			record.id,
			record.profileId,
			record.platform,
			record.scopeType,
			record.scopeKey,
			record.conversationId,
			record.lastInboundAt,
			record.createdAt,
			record.updatedAt,
		],
	});

	return record;
};

const updateBindingConversation = async (input: {
	bindingId: string;
	conversationId: string;
	lastInboundAt: string;
	now: string;
}) => {
	await getClient().execute({
		sql: `UPDATE external_conversation_bindings
       SET conversation_id = ?, last_inbound_at = ?, updated_at = ?
       WHERE id = ?`,
		args: [
			input.conversationId,
			input.lastInboundAt,
			input.now,
			input.bindingId,
		],
	});
};

const touchBinding = async (input: {
	bindingId: string;
	lastInboundAt: string;
	now: string;
}) => {
	await getClient().execute({
		sql: `UPDATE external_conversation_bindings
       SET last_inbound_at = ?, updated_at = ?
       WHERE id = ?`,
		args: [input.lastInboundAt, input.now, input.bindingId],
	});
};

const updateConversationStatus = async (input: {
	conversationId: string;
	status: "active" | "archived";
	now: string;
}) => {
	await getClient().execute({
		sql: `UPDATE conversations
       SET status = ?, updated_at = ?
       WHERE id = ?`,
		args: [input.status, input.now, input.conversationId],
	});
};

const copySeedMessages = async (input: {
	sourceConversationId: string;
	targetConversationId: string;
	messages: DiscordMessageRow[];
	limits: DiscordExternalConversationRolloverLimits;
	now: string;
}) => {
	const seedMessages = selectDiscordExternalConversationSeedMessages({
		messages: input.messages.map((message) => ({
			id: message.id,
			role: message.role,
			kind: message.kind,
			content: message.content,
			metadata: parseJson(message.metadata_json),
			createdAt: message.created_at,
		})),
		seedMessageCount: input.limits.seedMessageCount,
	});

	for (const message of seedMessages) {
		const record = createMessageRecord({
			conversationId: input.targetConversationId,
			turnId: null,
			role: message.role,
			kind: message.kind,
			content: message.content,
			metadata: {
				...message.metadata,
				rollover: {
					kind: "seed_copy",
					sourceConversationId: input.sourceConversationId,
					sourceMessageId: message.id,
					sourceCreatedAt: message.createdAt,
				},
			},
		});

		await getClient().execute({
			sql: `INSERT INTO messages (
           id, conversation_id, turn_id, role, kind, content, metadata_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				record.id,
				record.conversationId,
				record.turnId,
				record.role,
				record.kind,
				record.content,
				record.metadataJson,
				input.now,
			],
		});
	}
};

const buildResult = (input: {
	conversationId: string;
	lifecycle: ResolveDiscordExternalConversationWindowLifecycle;
	rolloverReason: DiscordExternalConversationRolloverReason | null;
	previousConversationId: string | null;
}): ResolveDiscordExternalConversationWindowResult => ({
	conversationId: input.conversationId,
	lifecycle: input.lifecycle,
	rolloverReason: input.rolloverReason,
	previousConversationId: input.previousConversationId,
});

export const resolveDiscordExternalConversationWindow = Effect.fnUntraced(
	function* (rawInput: ResolveDiscordExternalConversationWindowInput) {
		const input =
			resolveDiscordExternalConversationWindowInputSchema.parse(rawInput);
		const now = input.now ?? new Date().toISOString();
		const limits = mergeDiscordRolloverLimits(input.limits);

		return yield* fromPromise("resolveDiscordExternalConversationWindow", () =>
			db.transaction(
				async () => {
					const binding = await readDiscordBinding({
						profileId: input.profileId,
						scopeKey: input.scopeKey,
					});

					if (!binding) {
						const conversation = await insertConversation({
							profileId: input.profileId,
							scopeKey: input.scopeKey,
							now,
						});
						await insertBinding({
							profileId: input.profileId,
							scopeKey: input.scopeKey,
							conversationId: conversation.id,
							now,
						});

						return buildResult({
							conversationId: conversation.id,
							lifecycle: "created",
							rolloverReason: null,
							previousConversationId: null,
						});
					}

					const existingConversation = await readConversation(
						binding.conversation_id
					);
					if (
						!existingConversation ||
						existingConversation.status !== "active"
					) {
						const conversation = await insertConversation({
							profileId: input.profileId,
							scopeKey: input.scopeKey,
							now,
						});

						await updateBindingConversation({
							bindingId: binding.id,
							conversationId: conversation.id,
							lastInboundAt: now,
							now,
						});

						return buildResult({
							conversationId: conversation.id,
							lifecycle: "repaired",
							rolloverReason: null,
							previousConversationId: binding.conversation_id,
						});
					}

					const existingMessages = await readConversationMessages(
						existingConversation.id
					);
					const rollover = decideDiscordExternalConversationRollover({
						stats: buildConversationStats(existingMessages),
						now,
						limits,
					});

					if (!rollover.shouldRollover) {
						await touchBinding({
							bindingId: binding.id,
							lastInboundAt: now,
							now,
						});

						return buildResult({
							conversationId: existingConversation.id,
							lifecycle: "reused",
							rolloverReason: null,
							previousConversationId: null,
						});
					}

					const nextConversation = await insertConversation({
						profileId: input.profileId,
						scopeKey: input.scopeKey,
						now,
					});

					await copySeedMessages({
						sourceConversationId: existingConversation.id,
						targetConversationId: nextConversation.id,
						messages: existingMessages,
						limits,
						now,
					});
					await updateConversationStatus({
						conversationId: existingConversation.id,
						status: "archived",
						now,
					});
					await updateBindingConversation({
						bindingId: binding.id,
						conversationId: nextConversation.id,
						lastInboundAt: now,
						now,
					});

					return buildResult({
						conversationId: nextConversation.id,
						lifecycle: "rolled_over",
						rolloverReason: rollover.reason,
						previousConversationId: existingConversation.id,
					});
				},
				{
					behavior: "immediate",
				}
			)
		);
	}
);

export type {
	ResolveDiscordExternalConversationWindowInput,
	ResolveDiscordExternalConversationWindowLifecycle,
	ResolveDiscordExternalConversationWindowResult,
};
export {
	resolveDiscordExternalConversationWindowInputSchema,
	resolveDiscordExternalConversationWindowLifecycleSchema,
	resolveDiscordExternalConversationWindowResultSchema,
};
