import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { conversationsTable } from "./conversations";
import { profilesTable } from "./profiles";

const memoriesTable = sqliteTable("memories", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profilesTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  conversationId: text("conversation_id").references(
    () => conversationsTable.id,
    {
      onDelete: "set null",
      onUpdate: "cascade",
    }
  ),
  episodeId: text("episode_id"),
  content: text("content").notNull(),
  type: text("type").notNull(),
  memoryClass: text("memory_class").notNull().default("episodic"),
  status: text("status").notNull().default("active"),
  keywordsJson: text("keywords_json").notNull(),
  importance: real("importance").notNull(),
  embeddingVersion: text("embedding_version"),
  sourceKind: text("source_kind").notNull().default("digest"),
  sourceStartTs: text("source_start_ts"),
  sourceEndTs: text("source_end_ts"),
  unresolved: integer("unresolved").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export { memoriesTable };
