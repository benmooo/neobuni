import { index, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { goalsTable } from "./goals"
import { profilesTable } from "./profiles"

const commitmentsTable = sqliteTable(
  "commitments",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profilesTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    goalId: text("goal_id").references(() => goalsTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    owner: text("owner").notNull(),
    title: text("title").notNull(),
    dueAt: text("due_at"),
    evidenceIdsJson: text("evidence_ids_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("commitments_profile_status_idx").on(table.profileId, table.status),
    index("commitments_goal_status_idx").on(table.goalId, table.status),
    index("commitments_profile_due_idx").on(table.profileId, table.dueAt),
  ],
)

export { commitmentsTable }
