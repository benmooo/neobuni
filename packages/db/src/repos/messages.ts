import { makeMessage } from "@neobuni/core";
import { and, asc, eq } from "drizzle-orm";
import { Effect } from "effect";

import { db, fromPromise } from "../client";
import { conversationsTable, messagesTable } from "../schema";

const createMessageRecord = makeMessage();

const parseMetadata = (value: string) => {
	try {
		return JSON.parse(value) as Record<string, unknown>;
	} catch {
		return {};
	}
};

const listMessages = Effect.fnUntraced(function* (
	conversationId: string,
	opts?: { offset?: number; limit?: number }
) {
	const buildQuery = () => {
		let query = db
			.select()
			.from(messagesTable)
			.where(eq(messagesTable.conversationId, conversationId))
			.orderBy(asc(messagesTable.createdAt))
			.$dynamic();

		if (opts?.offset !== undefined) {
			query = query.offset(opts.offset);
		}

		if (opts?.limit !== undefined) {
			query = query.limit(opts.limit);
		}

		return query;
	};

	const rows = yield* fromPromise("listMessages", buildQuery);

	return rows.map((row) => ({
		id: row.id,
		conversationId: row.conversationId,
		turnId: row.turnId,
		role: row.role as "system" | "user" | "assistant" | "tool",
		kind: row.kind as "text" | "generated" | "event" | "tool_result",
		content: row.content,
		metadata: parseMetadata(row.metadataJson),
		createdAt: row.createdAt,
	}));
});

const createMessage = Effect.fnUntraced(function* (
	conversationId: string,
	input: {
		turnId?: string | null;
		role: "system" | "user" | "assistant" | "tool";
		kind: "text" | "generated" | "event" | "tool_result";
		content: string;
		metadata: Record<string, unknown>;
	}
) {
	const record = createMessageRecord({
		conversationId,
		turnId: input.turnId,
		role: input.role,
		kind: input.kind,
		content: input.content,
		metadata: input.metadata,
	});

	yield* fromPromise("createMessage", () =>
		db.insert(messagesTable).values(record)
	);
	yield* fromPromise("createMessage", () =>
		db
			.update(conversationsTable)
			.set({ updatedAt: record.createdAt })
			.where(eq(conversationsTable.id, conversationId))
	);

	return {
		id: record.id,
		conversationId: record.conversationId,
		turnId: record.turnId,
		role: record.role,
		kind: record.kind,
		content: record.content,
		metadata: input.metadata,
		createdAt: record.createdAt,
	};
});

const updateMessage = Effect.fnUntraced(function* (
	conversationId: string,
	messageId: string,
	input: { content: string; metadata: Record<string, unknown> }
) {
	yield* fromPromise("updateMessage", () =>
		db
			.update(messagesTable)
			.set({
				content: input.content,
				metadataJson: JSON.stringify(input.metadata),
			})
			.where(
				and(
					eq(messagesTable.id, messageId),
					eq(messagesTable.conversationId, conversationId)
				)
			)
	);

	const row = yield* fromPromise("updateMessage", () =>
		db.query.messagesTable.findFirst({
			where: {
				id: messageId,
				conversationId,
			},
		})
	);
	if (!row) {
		return null;
	}

	return {
		id: row.id,
		conversationId: row.conversationId,
		turnId: row.turnId,
		role: row.role as "system" | "user" | "assistant" | "tool",
		kind: row.kind as "text" | "generated" | "event" | "tool_result",
		content: row.content,
		metadata: parseMetadata(row.metadataJson),
		createdAt: row.createdAt,
	};
});

const deleteMessage = Effect.fnUntraced(function* (
	conversationId: string,
	messageId: string
) {
	yield* fromPromise("deleteMessage", () =>
		db
			.delete(messagesTable)
			.where(
				and(
					eq(messagesTable.id, messageId),
					eq(messagesTable.conversationId, conversationId)
				)
			)
	);

	return { deleted: true };
});

export { createMessage, deleteMessage, listMessages, updateMessage };
