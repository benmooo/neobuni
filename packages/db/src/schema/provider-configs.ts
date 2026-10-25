import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { profilesTable } from "./profiles";

const providerConfigsTable = sqliteTable("provider_configs", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profilesTable.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  slot: text("slot").notNull(), // "chat" | "memory_embedding" | "memory_reasoning"
  provider: text("provider").notNull(),
  protocol: text("protocol").notNull().default(""),
  model: text("model").notNull(),
  apiKey: text("api_key").notNull(),
  baseUrl: text("base_url").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export { providerConfigsTable };
