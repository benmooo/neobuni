import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { profilesTable } from "./profiles";

const schedulesTable = sqliteTable("schedules", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profilesTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  triggerAt: text("trigger_at"),
  cronExpr: text("cron_expr"),
  timezone: text("timezone").notNull(),
  status: text("status").notNull(),
  lastTriggeredAt: text("last_triggered_at"),
  deliveredAt: text("delivered_at"),
  lastMaterializedAt: text("last_materialized_at"),
  metadataJson: text("metadata_json").notNull(),
  blueprintJson: text("blueprint_json"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export { schedulesTable };
