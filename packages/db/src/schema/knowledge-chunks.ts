import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { knowledgeDocumentsTable } from "./knowledge-documents";

const knowledgeChunksTable = sqliteTable("knowledge_chunks", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => knowledgeDocumentsTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  keywordsJson: text("keywords_json").notNull().default("[]"),
  tokenCount: integer("token_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export { knowledgeChunksTable };
