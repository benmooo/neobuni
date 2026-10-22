import {
	appendEvent as appendEventFx,
	createMemory as createMemoryFx,
	getMemory as getMemoryFx,
	runRepo,
} from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
	runRepo(appendEventFx(...args));
const createMemory = (...args: Parameters<typeof createMemoryFx>) =>
	runRepo(createMemoryFx(...args));
const getMemory = (...args: Parameters<typeof getMemoryFx>) =>
	runRepo(getMemoryFx(...args));

import { saveMemoryDef, saveMemoryInputSchema } from "@neobuni/contracts";
import { syncMemoryEmbedding } from "../memory/memory-write-side-effects";
import {
	buildMemoryConflictView,
	createOrReuseMemoryConflict,
	findMemoryConflictForDraft,
	resolveChatMemoryDraft,
} from "./memory-tool-shared";
import type { ServerToolContext } from "./types";

const createSaveMemoryTool = (context: ServerToolContext) =>
	saveMemoryDef.server(async (args) => {
		const input = saveMemoryInputSchema.parse(args);
		const draft = resolveChatMemoryDraft(input);
		const detection = await findMemoryConflictForDraft({
			profileId: context.profileId,
			draft,
		});

		if (detection.duplicateMemory) {
			const memory = await getMemory(detection.duplicateMemory.id);

			return {
				saved: false,
				memory,
				duplicateOfMemoryId: detection.duplicateMemory.id,
				conflict: null,
				note: "A matching active memory already exists.",
			};
		}

		if (detection.conflict) {
			const conflict = await createOrReuseMemoryConflict(context, {
				operation: "save",
				kind: detection.conflict.kind,
				reason: detection.conflict.reason,
				existingMemoryId: detection.conflict.memoryId,
				draft,
			});

			await appendEvent(context.profileId, "tool.save_memory.conflict", {
				conversationId: context.conversationId,
				turnId: context.turnId,
				conflictId: conflict.id,
				existingMemoryId: detection.conflict.memoryId,
				type: draft.type,
			});

			return {
				saved: false,
				memory: null,
				conflict: await buildMemoryConflictView(conflict),
				note: "A similar active memory already exists and needs resolution.",
			};
		}

		const memory = await createMemory(context.profileId, {
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
			sourceKind: "chat_tool",
		});

		await syncMemoryEmbedding({
			embeddingConfig: context.embeddingConfig,
			memoryId: memory.id,
			content: memory.content,
			status: memory.status,
		});

		await appendEvent(context.profileId, "tool.save_memory", {
			conversationId: context.conversationId,
			turnId: context.turnId,
			memoryId: memory.id,
			type: memory.type,
			unresolved: memory.unresolved,
		});

		return {
			saved: true,
			memory,
			note: `Saved ${memory.type} memory.`,
		};
	});

export { createSaveMemoryTool };
