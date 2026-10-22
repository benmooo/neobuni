import * as schema from "../schema";
import { defineRelationsPart } from "drizzle-orm";

const knowledgeChunksRelations = defineRelationsPart(schema, ({
  knowledgeChunksTable,
  knowledgeDocumentsTable,
  knowledgeFactsTable,
  many,
  one,
}) => ({
  knowledgeChunksTable: {
    document: one.knowledgeDocumentsTable({
      from: knowledgeChunksTable.documentId,
      to: knowledgeDocumentsTable.id,
      optional: false,
    }),
    facts: many.knowledgeFactsTable({
      from: knowledgeChunksTable.id,
      to: knowledgeFactsTable.chunkId,
    }),
  },
}));

export { knowledgeChunksRelations };
