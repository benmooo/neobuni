import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import {
  actionAuthorizationsTable,
  actionProposalsTable,
} from "./action-proposals";
import { profilesTable } from "./profiles";

const actionRunsTable = sqliteTable(
  "action_runs",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profilesTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    proposalId: text("proposal_id")
      .notNull()
      .references(() => actionProposalsTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    authorizationId: text("authorization_id")
      .notNull()
      .references(() => actionAuthorizationsTable.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull(),
    inputJson: text("input_json").notNull(),
    attempt: integer("attempt").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(1),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: text("lease_expires_at"),
    checkpointJson: text("checkpoint_json"),
    receiptJson: text("receipt_json"),
    resultJson: text("result_json"),
    errorJson: text("error_json"),
    createdAt: text("created_at").notNull(),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("action_runs_proposal_unq").on(table.proposalId),
    uniqueIndex("action_runs_idempotency_key_unq").on(table.idempotencyKey),
    index("action_runs_profile_status_idx").on(table.profileId, table.status),
    index("action_runs_status_lease_idx").on(
      table.status,
      table.leaseExpiresAt
    ),
  ]
);

export { actionRunsTable };
