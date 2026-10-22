import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { conversationsTable } from "./conversations";
import { messagesTable } from "./messages";
import { profilesTable } from "./profiles";

const digestAnchorsTable = sqliteTable("digest_anchors", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profilesTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  conversationId: text("conversation_id")
    .notNull()
    .unique()
    .references(() => conversationsTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  lastMessageId: text("last_message_id")
    .notNull()
    .references(() => messagesTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  lastMessageTs: text("last_message_ts").notNull(),
  createdAt: text("created_at").notNull(),
});

export { digestAnchorsTable };
