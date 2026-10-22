import { profilesTable } from "./profiles";
import { soulConfigsTable } from "./soul-configs";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

const agentConfigsTable = sqliteTable("agent_configs", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profilesTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  soulConfigId: text("soul_config_id").references(() => soulConfigsTable.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  aiName: text("ai_name").notNull(),
  avatarUri: text("avatar_uri"),
  userName: text("user_name").notNull(),
  userPersona: text("user_persona").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export { agentConfigsTable };
