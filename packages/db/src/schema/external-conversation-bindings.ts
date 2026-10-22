import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { conversationsTable } from "./conversations";
import { profilesTable } from "./profiles";

const externalConversationBindingsTable = sqliteTable(
  "external_conversation_bindings",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profilesTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    platform: text("platform").notNull(),
    scopeType: text("scope_type").notNull(),
    scopeKey: text("scope_key").notNull(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversationsTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    lastInboundAt: text("last_inbound_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("external_conversation_bindings_scope_idx").on(
      table.profileId,
      table.platform,
      table.scopeType,
      table.scopeKey,
    ),
  ],
);

export { externalConversationBindingsTable };
