import {
	appendEvent as appendEventFx,
	createMemory as createMemoryFx,
	getMemoryConflict as getMemoryConflictFx,
	getMemory as getMemoryFx,
	runRepo,
	updateMemoryConflict as updateMemoryConflictFx,
	updateMemory as updateMemoryFx,
} from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
	runRepo(appendEventFx(...args));
const createMemory = (...args: Parameters<typeof createMemoryFx>) =>
	runRepo(createMemoryFx(...args));
const getMemory = (...args: Parameters<typeof getMemoryFx>) =>
	runRepo(getMemoryFx(...args));
const getMemoryConflict = (...args: Parameters<typeof getMemoryConflictFx>) =>
	runRepo(getMemoryConflictFx(...args));
const updateMemory = (...args: Parameters<typeof updateMemoryFx>) =>
	runRepo(updateMemoryFx(...args));
const updateMemoryConflict = (
	...args: Parameters<typeof updateMemoryConflictFx>
) => runRepo(updateMemoryConflictFx(...args));

import {
	resolveMemoryConflictDef,
	resolveMemoryConflictInputSchema,
} from "@neobuni/contracts";
import { syncMemoryEmbedding } from "../memory/memory-write-side-effects";
import {
	buildMemoryConflictView,
	resolveChatMemoryDraft,
} from "./memory-tool-shared";
import type { ServerToolContext } from "./types";

const createResolveMemoryConflictTool = (context: ServerToolContext) =>
	resolveMemoryConflictDef.server(async (args) => {
		const input = resolveMemoryConflictInputSchema.parse(args);
		const conflict = await getMemoryConflict(input.conflictId);

		if (!conflict || conflict.profileId !== context.profileId) {
			throw new Error(`Memory conflict ${input.conflictId} not found.`);
		}

		if (!conflict.proposedMemory) {
			throw new Error(
				`Memory conflict ${input.conflictId} is missing proposed memory data.`
			);
		}

		if (conflict.status !== "open") {
			return {
				resolved: true,
				action: input.action,
				conflict: await buildMemoryConflictView(conflict),
				memory: conflict.subjectMemoryId
					? await getMemory(conflict.subjectMemoryId)
					: await getMemory(conflict.existingMemoryId),
				archivedMemoryIds: [],
				note: "Conflict was already closed.",
			};
		}

		const existingMemory = await getMemory(conflict.existingMemoryId);
		const subjectMemory = conflict.subjectMemoryId
			? await getMemory(conflict.subjectMemoryId)
			: null;

		if (!existingMemory) {
			throw new Error(
				`Existing memory ${conflict.existingMemoryId} not found.`
			);
		}

		const draft = resolveChatMemoryDraft({
			...conflict.proposedMemory,
			content: input.content ?? conflict.proposedMemory.content,
			keywords: input.keywords ?? conflict.proposedMemory.keywords,
			importance: input.importance ?? conflict.proposedMemory.importance,
			unresolved: input.unresolved ?? conflict.proposedMemory.unresolved,
		});

		let memory = subjectMemory ?? existingMemory;
		const archivedMemoryIds: string[] = [];

		const archiveMemory = async (memoryId: string) => {
			const archived = await updateMemory(memoryId, {
				status: "superseded",
				unresolved: false,
			});

			if (!archived) {
				throw new Error(
					`Memory ${memoryId} disappeared during conflict resolution.`
				);
			}

			await syncMemoryEmbedding({
				embeddingConfig: context.embeddingConfig,
				memoryId: archived.id,
				content: archived.content,
				status: archived.status,
			});

			archivedMemoryIds.push(archived.id);
			return archived;
		};

		if (input.action === "replace_existing") {
			if (subjectMemory) {
				const updatedSubject = await updateMemory(subjectMemory.id, {
					content: draft.content,
					type: draft.type,
					keywords: draft.keywords,
					importance: draft.importance,
					unresolved: draft.unresolved,
					status: draft.status,
					memoryClass: draft.memoryClass,
					sourceKind: "conflict_resolution",
				});

				if (!updatedSubject) {
					throw new Error(
						`Memory ${subjectMemory.id} disappeared during conflict resolution.`
					);
				}

				memory = updatedSubject;

				if (existingMemory.id !== subjectMemory.id) {
					await archiveMemory(existingMemory.id);
				}
			} else {
				const updatedExisting = await updateMemory(existingMemory.id, {
					content: draft.content,
					type: draft.type,
					keywords: draft.keywords,
					importance: draft.importance,
					unresolved: draft.unresolved,
					status: draft.status,
					memoryClass: draft.memoryClass,
					sourceKind: "conflict_resolution",
				});

				if (!updatedExisting) {
					throw new Error(
						`Memory ${existingMemory.id} disappeared during conflict resolution.`
					);
				}

				memory = updatedExisting;
			}
		}

		if (input.action === "create_separate_memory") {
			if (subjectMemory) {
				const updatedSubject = await updateMemory(subjectMemory.id, {
					content: draft.content,
					type: draft.type,
					keywords: draft.keywords,
					importance: draft.importance,
					unresolved: draft.unresolved,
					status: draft.status,
					memoryClass: draft.memoryClass,
					sourceKind: "conflict_resolution",
				});

				if (!updatedSubject) {
					throw new Error(
						`Memory ${subjectMemory.id} disappeared during conflict resolution.`
					);
				}

				memory = updatedSubject;
			} else {
				memory = await createMemory(context.profileId, {
					content: draft.content,
					type: draft.type,
					keywords: draft.keywords,
					importance: draft.importance,
					sourceStartTs: null,
					sourceEndTs: null,
					unresolved: draft.unresolved,
					conversationId: context.conversationId,
					memoryClass: draft.memoryClass,
					status: draft.status,
					sourceKind: "conflict_resolution",
				});
			}
		}

		if (input.action === "merge_memories") {
			if (subjectMemory) {
				const mergedSubject = await updateMemory(subjectMemory.id, {
					content: draft.content,
					type: draft.type,
					keywords: draft.keywords,
					importance: draft.importance,
					unresolved: draft.unresolved,
					status: draft.status,
					memoryClass: draft.memoryClass,
					sourceKind: "conflict_resolution",
				});

				if (!mergedSubject) {
					throw new Error(
						`Memory ${subjectMemory.id} disappeared during conflict resolution.`
					);
				}

				memory = mergedSubject;

				if (existingMemory.id !== subjectMemory.id) {
					await archiveMemory(existingMemory.id);
				}
			} else {
				const mergedExisting = await updateMemory(existingMemory.id, {
					content: draft.content,
					type: draft.type,
					keywords: draft.keywords,
					importance: draft.importance,
					unresolved: draft.unresolved,
					status: draft.status,
					memoryClass: draft.memoryClass,
					sourceKind: "conflict_resolution",
				});

				if (!mergedExisting) {
					throw new Error(
						`Memory ${existingMemory.id} disappeared during conflict resolution.`
					);
				}

				memory = mergedExisting;
			}
		}

		if (
			input.action === "replace_existing" ||
			input.action === "create_separate_memory" ||
			input.action === "merge_memories"
		) {
			await syncMemoryEmbedding({
				embeddingConfig: context.embeddingConfig,
				memoryId: memory.id,
				content: memory.content,
				status: memory.status,
			});
		}

		const closedConflict = await updateMemoryConflict(conflict.id, {
			status: input.action === "cancel" ? "cancelled" : "resolved",
			resolvedAt: new Date().toISOString(),
			resolution: {
				action: input.action,
				memoryId: memory.id,
				archivedMemoryIds,
				turnId: context.turnId,
			},
		});

		if (!closedConflict) {
			throw new Error(
				`Memory conflict ${conflict.id} disappeared during resolution.`
			);
		}

		await appendEvent(context.profileId, "tool.resolve_memory_conflict", {
			conversationId: context.conversationId,
			turnId: context.turnId,
			conflictId: conflict.id,
			action: input.action,
			memoryId: memory.id,
			archivedMemoryIds,
		});

		return {
			resolved: true,
			action: input.action,
			conflict: await buildMemoryConflictView(closedConflict),
			memory,
			archivedMemoryIds,
			note:
				input.action === "cancel"
					? "Cancelled the pending memory conflict without changing stored memories."
					: "Resolved memory conflict.",
		};
	});

export { createResolveMemoryConflictTool };
