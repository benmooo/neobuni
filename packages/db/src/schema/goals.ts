import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { profilesTable } from "./profiles";

const goalsTable = sqliteTable(
  "goals",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profilesTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    title: text("title").notNull(),
    desiredOutcome: text("desired_outcome").notNull(),
    status: text("status").notNull(),
    horizon: text("horizon").notNull(),
    successCriteriaJson: text("success_criteria_json").notNull(),
    constraintsJson: text("constraints_json").notNull(),
    autonomyMode: text("autonomy_mode").notNull(),
    planVersion: integer("plan_version").notNull().default(0),
    nextReviewAt: text("next_review_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("goals_profile_status_idx").on(table.profileId, table.status),
    index("goals_profile_review_idx").on(table.profileId, table.nextReviewAt),
  ]
);

export { goalsTable };
