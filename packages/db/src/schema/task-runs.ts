import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { profilesTable } from "./profiles";
import { schedulesTable } from "./schedules";

const taskRunsTable = sqliteTable(
	"task_runs",
	{
		id: text("id").primaryKey(),
		profileId: text("profile_id")
			.notNull()
			.references(() => profilesTable.id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		scheduleId: text("schedule_id")
			.notNull()
			.references(() => schedulesTable.id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		status: text("status").notNull(),
		scheduledFor: text("scheduled_for").notNull(),
		promptSnapshot: text("prompt_snapshot").notNull(),
		toolPolicySnapshotJson: text("tool_policy_snapshot_json"),
		inputSnapshotJson: text("input_snapshot_json"),
		attempt: integer("attempt").notNull().default(0),
		maxAttempts: integer("max_attempts").notNull().default(3),
		leaseOwner: text("lease_owner"),
		leaseExpiresAt: text("lease_expires_at"),
		heartbeatAt: text("heartbeat_at"),
		nextRetryAt: text("next_retry_at"),
		runtimeTurnId: text("runtime_turn_id"),
		resultJson: text("result_json"),
		errorJson: text("error_json"),
		createdAt: text("created_at").notNull(),
		startedAt: text("started_at"),
		finishedAt: text("finished_at"),
		updatedAt: text("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("task_runs_schedule_scheduled_for_unq").on(
			table.scheduleId,
			table.scheduledFor
		),
		index("task_runs_profile_status_idx").on(table.profileId, table.status),
		index("task_runs_status_retry_idx").on(table.status, table.nextRetryAt),
		index("task_runs_schedule_created_idx").on(
			table.scheduleId,
			table.createdAt
		),
	]
);

export { taskRunsTable };
