import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { goalsTable } from "./goals";
import { profilesTable } from "./profiles";

const studyGoalConfigsTable = sqliteTable(
  "study_goal_configs",
  {
    goalId: text("goal_id")
      .primaryKey()
      .references(() => goalsTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    profileId: text("profile_id")
      .notNull()
      .references(() => profilesTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    targetAt: text("target_at").notNull(),
    dailyMinutes: integer("daily_minutes").notNull(),
    timezone: text("timezone").notNull(),
    configJson: text("config_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("study_goal_configs_profile_idx").on(table.profileId)]
);

const studyPlansTable = sqliteTable(
  "study_plans",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profilesTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    goalId: text("goal_id")
      .notNull()
      .references(() => goalsTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    version: integer("version").notNull(),
    status: text("status").notNull(),
    templateId: text("template_id").notNull(),
    diagnosticsJson: text("diagnostics_json").notNull(),
    createdAt: text("created_at").notNull(),
    activatedAt: text("activated_at"),
  },
  (table) => [
    uniqueIndex("study_plans_goal_version_idx").on(table.goalId, table.version),
    index("study_plans_profile_status_idx").on(table.profileId, table.status),
    index("study_plans_goal_status_idx").on(table.goalId, table.status),
  ]
);

const studyPlanNodesTable = sqliteTable(
  "study_plan_nodes",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => studyPlansTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    parentId: text("parent_id"),
    kind: text("kind").notNull(),
    order: integer("order").notNull(),
    title: text("title").notNull(),
    objective: text("objective"),
    whatText: text("what_text"),
    howText: text("how_text"),
    resourcesJson: text("resources_json").notNull(),
    estimatedMinutes: integer("estimated_minutes").notNull(),
    weight: real("weight").notNull(),
    paper: text("paper").notNull(),
    syllabusRefsJson: text("syllabus_refs_json").notNull(),
    prerequisitesJson: text("prerequisites_json").notNull(),
    checkSpecsJson: text("check_specs_json").notNull(),
    enrichmentJson: text("enrichment_json"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("study_plan_nodes_plan_order_idx").on(table.planId, table.order),
    index("study_plan_nodes_parent_idx").on(table.parentId),
  ]
);

const studySessionsTable = sqliteTable(
  "study_sessions",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profilesTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    goalId: text("goal_id")
      .notNull()
      .references(() => goalsTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    planNodeId: text("plan_node_id")
      .notNull()
      .references(() => studyPlanNodesTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    scheduledFor: text("scheduled_for").notNull(),
    timezone: text("timezone").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    status: text("status").notNull(),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    actualMinutes: integer("actual_minutes"),
    rescheduledFrom: text("rescheduled_from"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("study_sessions_profile_date_idx").on(
      table.profileId,
      table.scheduledFor
    ),
    index("study_sessions_goal_status_idx").on(table.goalId, table.status),
    index("study_sessions_node_idx").on(table.planNodeId),
  ]
);

const studyChecksTable = sqliteTable(
  "study_checks",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profilesTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    goalId: text("goal_id")
      .notNull()
      .references(() => goalsTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sessionId: text("session_id").references(() => studySessionsTable.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    planNodeId: text("plan_node_id")
      .notNull()
      .references(() => studyPlanNodesTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    kind: text("kind").notNull(),
    prompt: text("prompt").notNull(),
    answer: text("answer"),
    rubric: text("rubric"),
    score: real("score"),
    maxScore: real("max_score").notNull(),
    passed: integer("passed"),
    gradedBy: text("graded_by"),
    feedback: text("feedback"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("study_checks_goal_created_idx").on(table.goalId, table.createdAt),
    index("study_checks_node_idx").on(table.planNodeId),
    index("study_checks_session_idx").on(table.sessionId),
  ]
);

const studyMasteryTable = sqliteTable(
  "study_mastery",
  {
    id: text("id").primaryKey(),
    goalId: text("goal_id")
      .notNull()
      .references(() => goalsTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    planNodeId: text("plan_node_id")
      .notNull()
      .references(() => studyPlanNodesTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    score: real("score").notNull(),
    confidence: real("confidence").notNull(),
    attempts: integer("attempts").notNull(),
    lastScore: real("last_score"),
    lastAssessedAt: text("last_assessed_at"),
    nextReviewAt: text("next_review_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("study_mastery_goal_node_idx").on(
      table.goalId,
      table.planNodeId
    ),
    index("study_mastery_goal_review_idx").on(table.goalId, table.nextReviewAt),
  ]
);

export {
  studyChecksTable,
  studyGoalConfigsTable,
  studyMasteryTable,
  studyPlanNodesTable,
  studyPlansTable,
  studySessionsTable,
};
