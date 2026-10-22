import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users as usersTable } from "./better-auth";

const profilesTable = sqliteTable("profiles", {
	id: text("id").primaryKey(),
	ownerUserId: text("owner_user_id").references(() => usersTable.id, {
		onDelete: "cascade",
		onUpdate: "cascade",
	}),
	name: text("name").notNull(),
	kind: text("kind").notNull().default("personal"),
	timezone: text("timezone"),
	archivedAt: text("archived_at"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export { profilesTable };
