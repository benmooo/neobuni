import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../schema";

const knowledgeFactsRelations = defineRelationsPart(
	schema,
	({
		knowledgeChunksTable,
		knowledgeDocumentsTable,
		knowledgeFactsTable,
		one,
	}) => ({
		knowledgeFactsTable: {
			document: one.knowledgeDocumentsTable({
				from: knowledgeFactsTable.documentId,
				to: knowledgeDocumentsTable.id,
				optional: false,
			}),
			chunk: one.knowledgeChunksTable({
				from: knowledgeFactsTable.chunkId,
				to: knowledgeChunksTable.id,
				optional: true,
			}),
		},
	})
);

export { knowledgeFactsRelations };
