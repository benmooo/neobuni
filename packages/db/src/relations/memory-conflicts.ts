import { defineRelationsPart } from "drizzle-orm";

import * as schema from "../schema";

const memoryConflictsRelations = defineRelationsPart(
	schema,
	({
		conversationsTable,
		memoriesTable,
		memoryConflictsTable,
		one,
		profilesTable,
	}) => ({
		memoryConflictsTable: {
			profile: one.profilesTable({
				from: memoryConflictsTable.profileId,
				to: profilesTable.id,
				optional: false,
			}),
			conversation: one.conversationsTable({
				from: memoryConflictsTable.conversationId,
				to: conversationsTable.id,
				optional: true,
			}),
			existingMemory: one.memoriesTable({
				from: memoryConflictsTable.existingMemoryId,
				to: memoriesTable.id,
				optional: false,
			}),
			subjectMemory: one.memoriesTable({
				from: memoryConflictsTable.subjectMemoryId,
				to: memoriesTable.id,
				optional: true,
			}),
		},
	})
);

export { memoryConflictsRelations };
