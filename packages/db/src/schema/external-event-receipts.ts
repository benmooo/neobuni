import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { profilesTable } from "./profiles";

const externalEventReceiptsTable = sqliteTable(
  "external_event_receipts",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profilesTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    platform: text("platform").notNull(),
    eventId: text("event_id").notNull(),
    receivedAt: text("received_at").notNull(),
  },
  (table) => [
    uniqueIndex("external_event_receipts_event_idx").on(
      table.profileId,
      table.platform,
      table.eventId
    ),
  ]
);

export { externalEventReceiptsTable };
