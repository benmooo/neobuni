import { conversationsTable } from "./conversations";
import { runtimeTurnsTable } from "./runtime-turns";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

const messagesTable = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  turnId: text("turn_id").references(() => runtimeTurnsTable.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  role: text("role").notNull(),
  kind: text("kind").notNull(),
  content: text("content").notNull(),
  metadataJson: text("metadata_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export { messagesTable };
