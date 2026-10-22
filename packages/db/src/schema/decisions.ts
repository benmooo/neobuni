import {
	index,
	integer,
	real,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { goalsTable } from "./goals";
import { profilesTable } from "./profiles";

const decisionsTable = sqliteTable(
	"decisions",
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
		trigger: text("trigger").notNull(),
		stateFingerprint: text("state_fingerprint").notNull(),
		route: text("route").notNull(),
		permitted: integer("permitted").notNull(),
		policyVersion: text("policy_version").notNull(),
		policyReasonsJson: text("policy_reasons_json").notNull(),
		createdAt: text("created_at").notNull(),
	},
	(table) => [
		index("decisions_profile_created_idx").on(table.profileId, table.createdAt),
		index("decisions_goal_created_idx").on(table.goalId, table.createdAt),
	]
);

const decisionCandidatesTable = sqliteTable(
	"decision_candidates",
	{
		id: text("id").primaryKey(),
		decisionId: text("decision_id")
			.notNull()
			.references(() => decisionsTable.id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		kind: text("kind").notNull(),
		title: text("title").notNull(),
		rationale: text("rationale").notNull(),
		reversibility: text("reversibility").notNull(),
		authority: text("authority").notNull(),
		eligible: integer("eligible").notNull(),
		createdAt: text("created_at").notNull(),
	},
	(table) => [index("decision_candidates_decision_idx").on(table.decisionId)]
);

const decisionJudgmentsTable = sqliteTable(
	"decision_judgments",
	{
		id: text("id").primaryKey(),
		decisionId: text("decision_id")
			.notNull()
			.references(() => decisionsTable.id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		provider: text("provider").notNull(),
		providerVersion: text("provider_version").notNull(),
		questionId: text("question_id").notNull(),
		kind: text("kind").notNull(),
		selectedValueJson: text("selected_value_json").notNull(),
		probabilitiesJson: text("probabilities_json").notNull(),
		confidence: real("confidence"),
		latencyMs: integer("latency_ms"),
		createdAt: text("created_at").notNull(),
	},
	(table) => [index("decision_judgments_decision_idx").on(table.decisionId)]
);

const decisionFeedbackTable = sqliteTable(
	"decision_feedback",
	{
		id: text("id").primaryKey(),
		decisionId: text("decision_id")
			.notNull()
			.references(() => decisionsTable.id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		profileId: text("profile_id")
			.notNull()
			.references(() => profilesTable.id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		kind: text("kind").notNull(),
		candidateId: text("candidate_id"),
		note: text("note"),
		createdAt: text("created_at").notNull(),
	},
	(table) => [
		index("decision_feedback_decision_idx").on(table.decisionId),
		index("decision_feedback_profile_created_idx").on(
			table.profileId,
			table.createdAt
		),
	]
);

export {
	decisionCandidatesTable,
	decisionFeedbackTable,
	decisionJudgmentsTable,
	decisionsTable,
};
