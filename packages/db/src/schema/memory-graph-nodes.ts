import { profilesTable } from "./profiles";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

const memoryGraphNodesTable = sqliteTable("memory_graph_nodes", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profilesTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  kind: text("kind").notNull(),
  canonicalName: text("canonical_name").notNull(),
  summary: text("summary").notNull(),
  status: text("status").notNull().default("active"),
  payloadJson: text("payload_json"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export { memoryGraphNodesTable };
