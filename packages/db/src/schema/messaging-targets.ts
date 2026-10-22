import {
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { profilesTable } from "./profiles";

const messagingTargetsTable = sqliteTable(
	"messaging_targets",
	{
		id: text("id").primaryKey(),
		profileId: text("profile_id")
			.notNull()
			.references(() => profilesTable.id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		platform: text("platform").notNull(),
		alias: text("alias").notNull(),
		label: text("label").notNull().default(""),
		targetType: text("target_type").notNull(),
		targetId: text("target_id").notNull(),
		enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
		metadataJson: text("metadata_json").notNull().default("{}"),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("messaging_targets_profile_platform_alias_idx").on(
			table.profileId,
			table.platform,
			table.alias
		),
	]
);

export { messagingTargetsTable };
