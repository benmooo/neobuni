import { profilesTable } from "./profiles";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

const eventsTable = sqliteTable("events", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profilesTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  type: text("type").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export { eventsTable };
