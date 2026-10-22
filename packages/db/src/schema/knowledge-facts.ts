import { knowledgeChunksTable } from "./knowledge-chunks";
import { knowledgeDocumentsTable } from "./knowledge-documents";
import { real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const knowledgeFactsTable = sqliteTable("knowledge_facts", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => knowledgeDocumentsTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  chunkId: text("chunk_id").references(() => knowledgeChunksTable.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  subject: text("subject").notNull(),
  predicate: text("predicate").notNull(),
  object: text("object").notNull(),
  confidence: real("confidence").notNull().default(0.5),
  createdAt: text("created_at").notNull(),
});

export { knowledgeFactsTable };
