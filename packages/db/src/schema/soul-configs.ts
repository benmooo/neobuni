import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { profilesTable } from "./profiles";

const soulConfigsTable = sqliteTable("soul_configs", {
	id: text("id").primaryKey(),
	profileId: text("profile_id")
		.notNull()
		.references(() => profilesTable.id, {
			onDelete: "cascade",
			onUpdate: "cascade",
		}),
	version: integer("version").notNull(),
	configJson: text("config_json").notNull(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export { soulConfigsTable };
