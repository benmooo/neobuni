import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { decisionsTable } from "./decisions";
import { goalsTable } from "./goals";
import { profilesTable } from "./profiles";

const actionProposalsTable = sqliteTable(
	"action_proposals",
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
		decisionId: text("decision_id")
			.notNull()
			.references(() => decisionsTable.id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		candidateId: text("candidate_id").notNull(),
		kind: text("kind").notNull(),
		title: text("title").notNull(),
		expectedOutcome: text("expected_outcome").notNull(),
		reversibility: text("reversibility").notNull(),
		requiredAuthority: text("required_authority").notNull(),
		inputJson: text("input_json").notNull(),
		status: text("status").notNull(),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	},
	(table) => [
		index("action_proposals_profile_created_idx").on(
			table.profileId,
			table.createdAt
		),
		index("action_proposals_decision_idx").on(table.decisionId),
	]
);

const actionAuthorizationsTable = sqliteTable(
	"action_authorizations",
	{
		id: text("id").primaryKey(),
		proposalId: text("proposal_id")
			.notNull()
			.references(() => actionProposalsTable.id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		profileId: text("profile_id")
			.notNull()
			.references(() => profilesTable.id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		mode: text("mode").notNull(),
		grantedBy: text("granted_by").notNull(),
		constraintsJson: text("constraints_json").notNull(),
		expiresAt: text("expires_at"),
		revokedAt: text("revoked_at"),
		createdAt: text("created_at").notNull(),
	},
	(table) => [
		index("action_authorizations_proposal_idx").on(table.proposalId),
		index("action_authorizations_profile_created_idx").on(
			table.profileId,
			table.createdAt
		),
	]
);

export { actionAuthorizationsTable, actionProposalsTable };
