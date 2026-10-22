import {
	appendEvent as appendEventFx,
	getMemory as getMemoryFx,
	runRepo,
	updateMemory as updateMemoryFx,
} from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
	runRepo(appendEventFx(...args));
const getMemory = (...args: Parameters<typeof getMemoryFx>) =>
	runRepo(getMemoryFx(...args));
const updateMemory = (...args: Parameters<typeof updateMemoryFx>) =>
	runRepo(updateMemoryFx(...args));

import { updateMemoryDef, updateMemoryInputSchema } from "@neobuni/contracts";
import { syncMemoryEmbedding } from "../memory/memory-write-side-effects";
import {
	buildMemoryConflictView,
	createOrReuseMemoryConflict,
	findMemoryConflictForDraft,
	resolveChatMemoryDraft,
} from "./memory-tool-shared";
import type { ServerToolContext } from "./types";

const createUpdateMemoryTool = (context: ServerToolContext) =>
	updateMemoryDef.server(async (args) => {
		const input = updateMemoryInputSchema.parse(args);
		const existing = await getMemory(input.memoryId);

		if (!existing || existing.profileId !== context.profileId) {
			throw new Error(`Memory ${input.memoryId} not found.`);
		}

		const draft = resolveChatMemoryDraft({
			content: input.content ?? existing.content,
			type: input.type ?? existing.type,
			keywords: input.keywords ?? existing.keywords,
			importance: input.importance ?? existing.importance,
			unresolved: input.unresolved ?? existing.unresolved,
			status: input.status ?? existing.status,
			memoryClass: existing.memoryClass,
		});

		const hasChanges =
			draft.content !== existing.content ||
			draft.type !== existing.type ||
			draft.status !== existing.status ||
			draft.unresolved !== existing.unresolved ||
			draft.importance !== existing.importance ||
			draft.keywords.join("\u0000") !== existing.keywords.join("\u0000");

		if (!hasChanges) {
			return {
				updated: true,
				memory: existing,
				conflict: null,
				note: "No changes were needed.",
			};
		}

		const detection = await findMemoryConflictForDraft({
			profileId: context.profileId,
			draft,
			excludeMemoryIds: [existing.id],
		});

		const duplicateTargetId =
			detection.duplicateMemory?.id ?? detection.conflict?.memoryId ?? null;

		if (duplicateTargetId) {
			const conflict = await createOrReuseMemoryConflict(context, {
				operation: "update",
				kind:
					detection.conflict?.kind ??
					(draft.type === "task" ? "task_overlap" : "semantic_overlap"),
				reason:
					detection.conflict?.reason ??
					"The proposed update would duplicate another active memory and needs resolution.",
				existingMemoryId: duplicateTargetId,
				subjectMemoryId: existing.id,
				draft,
			});

			await appendEvent(context.profileId, "tool.update_memory.conflict", {
				conversationId: context.conversationId,
				turnId: context.turnId,
				conflictId: conflict.id,
				memoryId: existing.id,
				existingMemoryId: duplicateTargetId,
				type: draft.type,
			});

			return {
				updated: false,
				memory: null,
				conflict: await buildMemoryConflictView(conflict),
				note: "The proposed update conflicts with another active memory.",
			};
		}

		const memory = await updateMemory(existing.id, {
			content: draft.content,
			type: draft.type,
			keywords: draft.keywords,
			importance: draft.importance,
			unresolved: draft.unresolved,
			status: draft.status,
			memoryClass: draft.memoryClass,
		});

		if (!memory) {
			throw new Error(`Memory ${existing.id} disappeared during update.`);
		}

		await syncMemoryEmbedding({
			embeddingConfig: context.embeddingConfig,
			memoryId: memory.id,
			content: memory.content,
			status: memory.status,
		});

		await appendEvent(context.profileId, "tool.update_memory", {
			conversationId: context.conversationId,
			turnId: context.turnId,
			memoryId: memory.id,
			type: memory.type,
			status: memory.status,
		});

		return {
			updated: true,
			memory,
			note: `Updated memory ${memory.id}.`,
		};
	});

export { createUpdateMemoryTool };
