import {
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { profilesTable } from "./profiles";

const messagingIntegrationsTable = sqliteTable(
	"messaging_integrations",
	{
		id: text("id").primaryKey(),
		profileId: text("profile_id")
			.notNull()
			.references(() => profilesTable.id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		platform: text("platform").notNull(),
		enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
		botToken: text("bot_token").notNull().default(""),
		appId: text("app_id"),
		appSecret: text("app_secret"),
		publicKey: text("public_key"),
		webhookSecret: text("webhook_secret"),
		baseUrl: text("base_url"),
		metadataJson: text("metadata_json").notNull().default("{}"),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("messaging_integrations_profile_platform_idx").on(
			table.profileId,
			table.platform
		),
	]
);

export { messagingIntegrationsTable };
