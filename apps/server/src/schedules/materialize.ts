import { projectLegacyTaskRunAsAction } from "@neobuni/core";
import {
	appendEvent,
	createTaskRun,
	type DbError,
	getTaskRunByScheduleAndScheduledFor,
	updateSchedule,
} from "@neobuni/db";
import { Effect } from "effect";

import {
	buildFallbackPrompt,
	buildMaterializedToolPolicySnapshot,
	compileScheduleExecutionPrompt,
} from "./materialized-task-config";
import { getNextCronTriggerAt } from "./recurrence";

type PersistedSchedule = NonNullable<
	Effect.Success<ReturnType<typeof updateSchedule>>
>;

type MaterializeScheduleDeps = {
	appendEvent: typeof appendEvent;
	createTaskRun: typeof createTaskRun;
	getTaskRunByScheduleAndScheduledFor: typeof getTaskRunByScheduleAndScheduledFor;
	updateSchedule: typeof updateSchedule;
};

type MaterializeScheduleResult = {
	scheduleId: string;
	taskRunId: string | null;
	scheduledFor: string | null;
	materialized: boolean;
	nextTriggerAt: string | null;
	completed: boolean;
};

const defaultDeps: MaterializeScheduleDeps = {
	appendEvent,
	createTaskRun,
	getTaskRunByScheduleAndScheduledFor,
	updateSchedule,
};

const UNIQUE_CONSTRAINT_PATTERN = /unique constraint|constraint failed/i;

const MAX_CAUSE_DEPTH = 5;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isUniqueConstraintError = (error: unknown) => {
	let current: unknown = error;

	for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth += 1) {
		if (current === null || current === undefined) {
			return false;
		}

		if (
			current instanceof Error &&
			UNIQUE_CONSTRAINT_PATTERN.test(current.message)
		) {
			return true;
		}

		if (!isRecord(current)) {
			return false;
		}

		current = current.cause;
	}

	return false;
};

const readScheduleBlueprint = (schedule: PersistedSchedule) =>
	isRecord(schedule.blueprint) ? schedule.blueprint : null;

const buildTaskRunInputSnapshot = (
	schedule: PersistedSchedule,
	scheduledFor: string
) => {
	const blueprint = readScheduleBlueprint(schedule);

	return {
		scheduleId: schedule.id,
		scheduleType: schedule.type,
		timezone: schedule.timezone,
		scheduledFor,
		source: "schedule_materializer",
		metadata: schedule.metadata,
		blueprintInput: isRecord(blueprint?.input) ? blueprint.input : null,
		deliveryIntent: isRecord(blueprint?.deliveryIntent)
			? blueprint.deliveryIntent
			: null,
	};
};

const buildTaskRunInput = (
	schedule: PersistedSchedule,
	scheduledFor: string
) => ({
	profileId: schedule.profileId,
	scheduleId: schedule.id,
	scheduledFor,
	promptSnapshot: readScheduleBlueprint(schedule)
		? compileScheduleExecutionPrompt({
				schedule,
				scheduledFor,
			})
		: buildFallbackPrompt(schedule),
	toolPolicySnapshot: buildMaterializedToolPolicySnapshot(schedule),
	inputSnapshot: buildTaskRunInputSnapshot(schedule, scheduledFor),
});

const createOrReuseTaskRun = Effect.fnUntraced(function* (
	deps: MaterializeScheduleDeps,
	schedule: PersistedSchedule,
	scheduledFor: string
) {
	return yield* Effect.catch(
		deps.createTaskRun(buildTaskRunInput(schedule, scheduledFor)),
		(error) =>
			Effect.gen(function* () {
				if (!isUniqueConstraintError(error)) {
					return yield* Effect.fail(error);
				}

				const existing = yield* deps.getTaskRunByScheduleAndScheduledFor({
					scheduleId: schedule.id,
					scheduledFor,
				});

				if (existing === null) {
					return yield* Effect.fail(error);
				}

				return existing;
			})
	);
});

const materializeDueSchedule = Effect.fnUntraced(function* (input: {
	nowIso: string;
	schedule: PersistedSchedule;
	deps?: Partial<MaterializeScheduleDeps>;
}): Effect.fn.Return<MaterializeScheduleResult, DbError> {
	const deps = {
		...defaultDeps,
		...(input.deps ?? {}),
	};

	const scheduledFor = input.schedule.triggerAt;

	if (!scheduledFor) {
		return {
			scheduleId: input.schedule.id,
			taskRunId: null,
			scheduledFor: null,
			materialized: false,
			nextTriggerAt: null,
			completed: false,
		};
	}

	const taskRun = yield* createOrReuseTaskRun(
		deps,
		input.schedule,
		scheduledFor
	);

	const nextTriggerAt = input.schedule.cronExpr
		? getNextCronTriggerAt({
				cronExpr: input.schedule.cronExpr,
				timezone: input.schedule.timezone,
				afterIso: input.nowIso,
			})
		: null;

	const completed = input.schedule.cronExpr === null;

	yield* deps.updateSchedule(input.schedule.id, {
		triggerAt: nextTriggerAt,
		status: completed ? "completed" : input.schedule.status,
		lastMaterializedAt: input.nowIso,
	});

	const legacyActionProjection = projectLegacyTaskRunAsAction(taskRun);

	yield* deps.appendEvent(input.schedule.profileId, "schedule.materialized", {
		scheduleId: input.schedule.id,
		taskRunId: taskRun.id,
		scheduledFor,
		nextTriggerAt,
		completed,
		legacyActionProjection: {
			operation: legacyActionProjection.operation,
			idempotencyKey: legacyActionProjection.idempotencyKey,
			requiresExternalReconciliation:
				legacyActionProjection.requiresExternalReconciliation,
		},
	});

	return {
		scheduleId: input.schedule.id,
		taskRunId: taskRun.id,
		scheduledFor,
		materialized: true,
		nextTriggerAt,
		completed,
	};
});

export { buildFallbackPrompt, materializeDueSchedule };
