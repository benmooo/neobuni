import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { conversationsTable } from "./conversations";
import { memoriesTable } from "./memories";
import { profilesTable } from "./profiles";

const memoryConflictsTable = sqliteTable(
  "memory_conflicts",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profilesTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    conversationId: text("conversation_id").references(
      () => conversationsTable.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      }
    ),
    turnId: text("turn_id"),
    operation: text("operation").notNull(),
    conflictKind: text("conflict_kind").notNull(),
    status: text("status").notNull().default("open"),
    reason: text("reason").notNull(),
    existingMemoryId: text("existing_memory_id")
      .notNull()
      .references(() => memoriesTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    subjectMemoryId: text("subject_memory_id").references(
      () => memoriesTable.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      }
    ),
    proposalJson: text("proposal_json").notNull(),
    resolutionJson: text("resolution_json"),
    resolvedAt: text("resolved_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("memory_conflicts_profile_status_idx").on(
      table.profileId,
      table.status,
      table.createdAt
    ),
  ]
);

export { memoryConflictsTable };
