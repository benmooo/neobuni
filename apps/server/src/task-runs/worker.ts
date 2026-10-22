import {
	appendEvent,
	attachTaskRunRuntimeTurn,
	claimTaskRun,
	completeTaskRun,
	failTaskRun,
	listActiveProfiles,
	listClaimableTaskRuns,
	runRepo,
	startTaskRun,
} from "@neobuni/db";

import { Effect, tryPromise } from "../effect";
import { runHeadlessTaskTurn } from "../runtime/run-headless-task-turn";
import { getSurfacePolicy } from "../runtime/surface-policy";

type TaskRunWorkerConfig = {
	enabled: boolean;
	tickMs: number;
	limitPerProfile: number;
	leaseMs: number;
	retryDelayMs: number;
	timeoutMs: number;
};

type TaskRunExecutionResult = {
	claimed: boolean;
	succeeded: boolean;
	failed: boolean;
};

type TaskRunWorkerProfileResult = {
	profileId: string;
	claimableCount: number;
	succeededCount: number;
	failedCount: number;
};

type TaskRunWorkerSweepResult = {
	startedAt: string;
	profileResults: TaskRunWorkerProfileResult[];
};

type TaskRunWorkerDeps = {
	appendEvent: typeof appendEvent;
	attachTaskRunRuntimeTurn: typeof attachTaskRunRuntimeTurn;
	claimTaskRun: typeof claimTaskRun;
	completeTaskRun: typeof completeTaskRun;
	failTaskRun: typeof failTaskRun;
	listActiveProfiles: typeof listActiveProfiles;
	listClaimableTaskRuns: typeof listClaimableTaskRuns;
	runHeadlessTaskTurn: typeof runHeadlessTaskTurn;
	startTaskRun: typeof startTaskRun;
};

const DEFAULT_TASK_RUN_WORKER_CONFIG: TaskRunWorkerConfig = {
	enabled: true,
	tickMs: 15_000,
	limitPerProfile: 10,
	leaseMs: 60_000,
	retryDelayMs: 60_000,
	timeoutMs: 120_000,
};

const defaultDeps: TaskRunWorkerDeps = {
	appendEvent,
	attachTaskRunRuntimeTurn,
	claimTaskRun,
	completeTaskRun,
	failTaskRun,
	listActiveProfiles,
	listClaimableTaskRuns,
	runHeadlessTaskTurn,
	startTaskRun,
};

const toBoolean = (value: string | undefined, fallback: boolean) => {
	if (value === undefined) {
		return fallback;
	}

	const normalized = value.trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(normalized)) {
		return true;
	}
	if (["0", "false", "no", "off"].includes(normalized)) {
		return false;
	}
	return fallback;
};

const toPositiveInt = (
	value: string | undefined,
	fallback: number,
	min = 1
) => {
	const parsed = value ? Number(value) : Number.NaN;
	return Number.isFinite(parsed) ? Math.max(min, Math.trunc(parsed)) : fallback;
};

const readTaskRunWorkerConfig = (): TaskRunWorkerConfig => ({
	enabled: toBoolean(
		process.env.NEOBUNI_TASK_RUN_WORKER_ENABLED,
		DEFAULT_TASK_RUN_WORKER_CONFIG.enabled
	),
	tickMs: toPositiveInt(
		process.env.NEOBUNI_TASK_RUN_WORKER_TICK_MS,
		DEFAULT_TASK_RUN_WORKER_CONFIG.tickMs,
		1000
	),
	limitPerProfile: toPositiveInt(
		process.env.NEOBUNI_TASK_RUN_WORKER_LIMIT_PER_PROFILE,
		DEFAULT_TASK_RUN_WORKER_CONFIG.limitPerProfile,
		1
	),
	leaseMs: toPositiveInt(
		process.env.NEOBUNI_TASK_RUN_WORKER_LEASE_MS,
		DEFAULT_TASK_RUN_WORKER_CONFIG.leaseMs,
		5000
	),
	retryDelayMs: toPositiveInt(
		process.env.NEOBUNI_TASK_RUN_WORKER_RETRY_DELAY_MS,
		DEFAULT_TASK_RUN_WORKER_CONFIG.retryDelayMs,
		1000
	),
	timeoutMs: toPositiveInt(
		process.env.NEOBUNI_TASK_RUN_WORKER_TIMEOUT_MS,
		DEFAULT_TASK_RUN_WORKER_CONFIG.timeoutMs,
		5000
	),
});

const asRecord = (value: unknown): Record<string, unknown> | null =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;

const readStringArray = (value: unknown): string[] | null =>
	Array.isArray(value)
		? value.filter(
				(item): item is string =>
					typeof item === "string" && item.trim().length > 0
			)
		: null;

const readNullableNumber = (value: unknown): number | null =>
	typeof value === "number" && Number.isFinite(value) ? value : null;

const readConversationIdFromTaskRun = (taskRun: {
	inputSnapshot: Record<string, unknown> | null;
}) => {
	const deliveryIntent = asRecord(taskRun.inputSnapshot?.deliveryIntent);
	if (typeof deliveryIntent?.conversationId === "string") {
		return deliveryIntent.conversationId;
	}

	const metadata = asRecord(taskRun.inputSnapshot?.metadata);
	return typeof metadata?.conversationId === "string"
		? metadata.conversationId
		: null;
};

const buildRetryAt = (nowIso: string, retryDelayMs: number) =>
	new Date(Date.parse(nowIso) + retryDelayMs).toISOString();

const hasChannelTargetDelivery = (taskRun: {
	inputSnapshot: Record<string, unknown> | null;
}) => {
	const deliveryIntent = asRecord(taskRun.inputSnapshot?.deliveryIntent);
	return asRecord(deliveryIntent?.channelTarget) !== null;
};

const describeError = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

const executeClaimedTaskRun = Effect.fnUntraced(function* (input: {
	nowIso: string;
	taskRun: Effect.Success<ReturnType<typeof listClaimableTaskRuns>>[number];
	config: TaskRunWorkerConfig;
	workerId: string;
	deps?: Partial<TaskRunWorkerDeps>;
}) {
	const deps = {
		...defaultDeps,
		...(input.deps ?? {}),
	};
	const claimed = yield* deps.claimTaskRun({
		taskRunId: input.taskRun.id,
		nowIso: input.nowIso,
		leaseOwner: input.workerId,
		leaseExpiresAt: new Date(
			Date.parse(input.nowIso) + input.config.leaseMs
		).toISOString(),
	});

	if (!claimed) {
		return {
			claimed: false,
			succeeded: false,
			failed: false,
		};
	}

	yield* deps.startTaskRun(claimed.id, {
		nowIso: input.nowIso,
	});

	yield* deps.appendEvent(claimed.profileId, "task_run.started", {
		taskRunId: claimed.id,
		scheduleId: claimed.scheduleId,
		scheduledFor: claimed.scheduledFor,
	});

	// `runHeadlessTaskTurn` still speaks Promise, so the turn-attachment callback
	// needs the documented `runRepo` bridge back into the repository Effect.
	const attachRuntimeTurn = (turnId: string) =>
		runRepo(deps.attachTaskRunRuntimeTurn(claimed.id, turnId)).then(
			() => undefined
		);

	const runClaimedTurn = Effect.gen(function* () {
		const toolPolicy = asRecord(claimed.toolPolicySnapshot);
		const result = yield* tryPromise("runHeadlessTaskTurn", () =>
			deps.runHeadlessTaskTurn({
				profileId: claimed.profileId,
				taskRunId: claimed.id,
				prompt: claimed.promptSnapshot,
				toolAllowlist: readStringArray(toolPolicy?.toolAllowlist),
				timeoutMs:
					readNullableNumber(toolPolicy?.timeoutMs) ?? input.config.timeoutMs,
				maxSteps: readNullableNumber(toolPolicy?.maxSteps),
				conversationId: readConversationIdFromTaskRun(claimed),
				surfacePolicy: hasChannelTargetDelivery(claimed)
					? getSurfacePolicy("task_run_public_safe")
					: getSurfacePolicy("task_run_private"),
				onTurnCreated: attachRuntimeTurn,
			})
		);

		yield* deps.completeTaskRun(claimed.id, {
			nowIso: new Date().toISOString(),
			runtimeTurnId: result.runtimeTurnId,
			result: {
				assistantText: result.assistantText,
				providerOutcome: result.providerOutcome,
				transcript: result.transcript,
			},
		});

		yield* deps.appendEvent(claimed.profileId, "task_run.succeeded", {
			taskRunId: claimed.id,
			scheduleId: claimed.scheduleId,
			runtimeTurnId: result.runtimeTurnId,
			providerOutcome: result.providerOutcome,
		});

		return {
			claimed: true,
			succeeded: true,
			failed: false,
		};
	});

	return yield* Effect.catchIf(
		runClaimedTurn,
		() => true,
		(error) =>
			Effect.gen(function* () {
				const message = describeError(error);
				const failedAt = new Date().toISOString();

				yield* deps.failTaskRun(claimed.id, {
					nowIso: failedAt,
					error: {
						message,
					},
					nextRetryAt: buildRetryAt(failedAt, input.config.retryDelayMs),
				});

				yield* deps.appendEvent(claimed.profileId, "task_run.failed", {
					taskRunId: claimed.id,
					scheduleId: claimed.scheduleId,
					error: message,
				});

				return {
					claimed: true,
					succeeded: false,
					failed: true,
				};
			})
	);
});

const runTaskRunWorkerSweep = Effect.fnUntraced(function* (input?: {
	nowIso?: string;
	config?: TaskRunWorkerConfig;
	profileIds?: string[];
	deps?: Partial<TaskRunWorkerDeps>;
}) {
	const deps = {
		...defaultDeps,
		...(input?.deps ?? {}),
	};
	const config = input?.config ?? readTaskRunWorkerConfig();
	const startedAt = input?.nowIso ?? new Date().toISOString();
	const workerId = `task-run-worker:${startedAt}`;
	const profileIds = input?.profileIds;
	const activeProfiles = yield* deps.listActiveProfiles();
	const profiles = activeProfiles.filter(
		(profile) => profileIds === undefined || profileIds.includes(profile.id)
	);
	const profileResults: TaskRunWorkerProfileResult[] = [];

	for (const profile of profiles) {
		const claimableTaskRuns = yield* deps.listClaimableTaskRuns({
			nowIso: startedAt,
			profileId: profile.id,
			limit: config.limitPerProfile,
		});
		let succeededCount = 0;
		let failedCount = 0;

		for (const taskRun of claimableTaskRuns) {
			const result: TaskRunExecutionResult = yield* executeClaimedTaskRun({
				nowIso: startedAt,
				taskRun,
				config,
				workerId,
				deps,
			});

			if (result.succeeded) {
				succeededCount += 1;
			}

			if (result.failed) {
				failedCount += 1;
			}
		}

		profileResults.push({
			profileId: profile.id,
			claimableCount: claimableTaskRuns.length,
			succeededCount,
			failedCount,
		});
	}

	return {
		startedAt,
		profileResults,
	};
});

const runTaskRunWorkerTick = Effect.fnUntraced(function* (
	config: TaskRunWorkerConfig,
	trigger: "startup" | "interval"
) {
	const result = yield* runTaskRunWorkerSweep({ config });
	const claimableCount = result.profileResults.reduce(
		(sum, profile) => sum + profile.claimableCount,
		0
	);
	const succeededCount = result.profileResults.reduce(
		(sum, profile) => sum + profile.succeededCount,
		0
	);
	const failedCount = result.profileResults.reduce(
		(sum, profile) => sum + profile.failedCount,
		0
	);

	if (
		claimableCount > 0 ||
		succeededCount > 0 ||
		failedCount > 0 ||
		trigger === "startup"
	) {
		yield* Effect.logInfo(
			`[buni/task-run-worker] ${trigger} sweep: profiles=${result.profileResults.length} claimable=${claimableCount} succeeded=${succeededCount} failed=${failedCount}`
		);
	}
});

const taskRunWorkerTick = (
	config: TaskRunWorkerConfig,
	trigger: "startup" | "interval"
) =>
	runTaskRunWorkerTick(config, trigger).pipe(
		Effect.catchIf(
			() => true,
			(error) =>
				Effect.logError(`[buni/task-run-worker] ${describeError(error)}`)
		),
		Effect.catchDefect((defect) =>
			Effect.logError(
				`[buni/task-run-worker] ${describeError(defect) || "task run worker tick failed"}`
			)
		)
	);

const startTaskRunWorker = Effect.fn("startTaskRunWorker")(function* () {
	const config = readTaskRunWorkerConfig();

	if (!config.enabled) {
		yield* Effect.logInfo("[buni/task-run-worker] disabled");
		return;
	}

	yield* Effect.logInfo(
		`[buni/task-run-worker] started tickMs=${config.tickMs} limitPerProfile=${config.limitPerProfile}`
	);

	yield* taskRunWorkerTick(config, "startup");

	yield* Effect.forever(
		Effect.andThen(Effect.sleep(config.tickMs), () =>
			taskRunWorkerTick(config, "interval")
		)
	);
});

export type {
	TaskRunExecutionResult,
	TaskRunWorkerConfig,
	TaskRunWorkerDeps,
	TaskRunWorkerProfileResult,
	TaskRunWorkerSweepResult,
};
export {
	executeClaimedTaskRun,
	readTaskRunWorkerConfig,
	runTaskRunWorkerSweep,
	startTaskRunWorker,
};
