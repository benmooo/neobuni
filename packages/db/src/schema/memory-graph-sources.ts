import { real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { profilesTable } from "./profiles";

const memoryGraphSourcesTable = sqliteTable("memory_graph_sources", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profilesTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  targetKind: text("target_kind").notNull(),
  targetId: text("target_id").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  evidenceText: text("evidence_text").notNull(),
  confidence: real("confidence").notNull().default(0.5),
  createdAt: text("created_at").notNull(),
});

export { memoryGraphSourcesTable };
