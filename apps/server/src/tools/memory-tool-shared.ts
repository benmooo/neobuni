import {
	createMemoryConflict as createMemoryConflictFx,
	findMatchingOpenMemoryConflict as findMatchingOpenMemoryConflictFx,
	getMemory as getMemoryFx,
	listMemories as listMemoriesFx,
	runRepo,
} from "@neobuni/db";

const createMemoryConflict = (
	...args: Parameters<typeof createMemoryConflictFx>
) => runRepo(createMemoryConflictFx(...args));
const findMatchingOpenMemoryConflict = (
	...args: Parameters<typeof findMatchingOpenMemoryConflictFx>
) => runRepo(findMatchingOpenMemoryConflictFx(...args));
const getMemory = (...args: Parameters<typeof getMemoryFx>) =>
	runRepo(getMemoryFx(...args));
const listMemories = (...args: Parameters<typeof listMemoriesFx>) =>
	runRepo(listMemoriesFx(...args));

import {
	type ComparableMemory,
	detectMemoryConflict,
	type MemoryConflictKind,
	type ResolvedChatMemoryDraft,
	resolveChatMemoryDraft,
} from "@neobuni/core";

import type { ServerToolContext } from "./types";

type StoredMemory = NonNullable<Awaited<ReturnType<typeof getMemory>>>;
type StoredMemoryConflict = Awaited<ReturnType<typeof createMemoryConflict>>;

const toComparableMemory = (memory: StoredMemory): ComparableMemory => ({
	id: memory.id,
	content: memory.content,
	type: memory.type,
	keywords: memory.keywords,
	unresolved: memory.unresolved,
	status: memory.status,
});

const findMemoryConflictForDraft = async (input: {
	profileId: string;
	draft: ResolvedChatMemoryDraft;
	excludeMemoryIds?: string[];
}) => {
	const existingMemories = await listMemories(input.profileId, {
		type: input.draft.type,
		status: "active",
	});

	return detectMemoryConflict({
		draft: input.draft,
		existingMemories: existingMemories.map(toComparableMemory),
		excludeMemoryIds: input.excludeMemoryIds,
	});
};

const ensureStoredMemory = async (memoryId: string) => {
	const memory = await getMemory(memoryId);
	if (!memory) {
		throw new Error(`Memory ${memoryId} not found.`);
	}
	return memory;
};

const createOrReuseMemoryConflict = async (
	context: ServerToolContext,
	input: {
		operation: "save" | "update";
		kind: MemoryConflictKind;
		reason: string;
		existingMemoryId: string;
		subjectMemoryId?: string | null;
		draft: ResolvedChatMemoryDraft;
	}
) => {
	const proposedMemory = {
		content: input.draft.content,
		type: input.draft.type,
		keywords: input.draft.keywords,
		importance: input.draft.importance,
		unresolved: input.draft.unresolved,
		status: input.draft.status,
		memoryClass: input.draft.memoryClass,
	};

	const existingConflict = await findMatchingOpenMemoryConflict({
		profileId: context.profileId,
		operation: input.operation,
		existingMemoryId: input.existingMemoryId,
		subjectMemoryId: input.subjectMemoryId ?? null,
		proposedMemory,
	});

	if (existingConflict) {
		return existingConflict;
	}

	return createMemoryConflict({
		profileId: context.profileId,
		conversationId: context.conversationId,
		turnId: context.turnId,
		operation: input.operation,
		kind: input.kind,
		reason: input.reason,
		existingMemoryId: input.existingMemoryId,
		subjectMemoryId: input.subjectMemoryId ?? null,
		proposedMemory,
	});
};

const buildMemoryConflictView = async (conflict: StoredMemoryConflict) => {
	if (!conflict.proposedMemory) {
		throw new Error(
			`Memory conflict ${conflict.id} is missing proposedMemory.`
		);
	}

	const existingMemory = await ensureStoredMemory(conflict.existingMemoryId);
	const subjectMemory = conflict.subjectMemoryId
		? await ensureStoredMemory(conflict.subjectMemoryId)
		: null;

	return {
		id: conflict.id,
		status: conflict.status,
		operation: conflict.operation,
		kind: conflict.kind,
		reason: conflict.reason,
		existingMemory,
		subjectMemory,
		proposedMemory: conflict.proposedMemory,
		createdAt: conflict.createdAt,
		resolvedAt: conflict.resolvedAt,
	};
};

export {
	buildMemoryConflictView,
	createOrReuseMemoryConflict,
	findMemoryConflictForDraft,
	resolveChatMemoryDraft,
};
