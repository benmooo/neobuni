import { profilesTable } from "./profiles";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

const knowledgeDocumentsTable = sqliteTable("knowledge_documents", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").references(() => profilesTable.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  scope: text("scope").notNull().default("profile"),
  title: text("title").notNull(),
  sourceType: text("source_type").notNull(),
  sourceUri: text("source_uri"),
  trustLevel: text("trust_level").notNull().default("imported"),
  checksum: text("checksum"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export { knowledgeDocumentsTable };
