import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { profilesTable } from "./profiles";

const conversationsTable = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profilesTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  title: text("title").notNull(),
  modelKey: text("model_key").notNull(),
  hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export { conversationsTable };
