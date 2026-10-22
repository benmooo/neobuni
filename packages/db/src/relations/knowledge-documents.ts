import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../schema";

const knowledgeDocumentsRelations = defineRelationsPart(
	schema,
	({
		knowledgeChunksTable,
		knowledgeDocumentsTable,
		knowledgeFactsTable,
		many,
		one,
		profilesTable,
	}) => ({
		knowledgeDocumentsTable: {
			profile: one.profilesTable({
				from: knowledgeDocumentsTable.profileId,
				to: profilesTable.id,
				optional: true,
			}),
			chunks: many.knowledgeChunksTable({
				from: knowledgeDocumentsTable.id,
				to: knowledgeChunksTable.documentId,
			}),
			facts: many.knowledgeFactsTable({
				from: knowledgeDocumentsTable.id,
				to: knowledgeFactsTable.documentId,
			}),
		},
	})
);

export { knowledgeDocumentsRelations };
