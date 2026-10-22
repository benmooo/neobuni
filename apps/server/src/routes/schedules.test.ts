import { call } from "@orpc/server";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { captureOrpcError, createTestContext } from "./test-support";

interface PersistedSchedule {
	blueprint?: Record<string, unknown> | null;
	content: string;
	createdAt: string;
	cronExpr: string | null;
	deliveredAt: string | null;
	id: string;
	lastTriggeredAt: string | null;
	metadata: Record<string, unknown>;
	profileId: string;
	status: "active" | "paused" | "completed" | "cancelled";
	timezone: string;
	title: string;
	triggerAt: string | null;
	type: "reminder" | "alarm" | "monitor";
	updatedAt: string;
}

interface PersistedTaskRun {
	attempt: number;
	createdAt: string;
	error: Record<string, unknown> | null;
	finishedAt: string | null;
	heartbeatAt: string | null;
	id: string;
	inputSnapshot: Record<string, unknown> | null;
	leaseExpiresAt: string | null;
	leaseOwner: string | null;
	maxAttempts: number;
	nextRetryAt: string | null;
	profileId: string;
	promptSnapshot: string;
	result: Record<string, unknown> | null;
	runtimeTurnId: string | null;
	scheduledFor: string;
	scheduleId: string;
	startedAt: string | null;
	status:
		| "queued"
		| "claimed"
		| "running"
		| "succeeded"
		| "failed"
		| "retry_scheduled"
		| "cancelled";
	toolPolicySnapshot: Record<string, unknown> | null;
	updatedAt: string;
}

const mocks = vi.hoisted(() => ({
	appendEvent: vi.fn(),
	createSchedule: vi.fn(),
	deleteSchedule: vi.fn(),
	getSchedule: vi.fn(),
	listSchedules: vi.fn(),
	listTaskRunsBySchedule: vi.fn(),
	updateSchedule: vi.fn(),
}));

vi.mock("@neobuni/db", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@neobuni/db")>();
	return {
		...actual,
		appendEvent: mocks.appendEvent,
		createSchedule: mocks.createSchedule,
		deleteSchedule: mocks.deleteSchedule,
		getSchedule: mocks.getSchedule,
		listSchedules: mocks.listSchedules,
		listTaskRunsBySchedule: mocks.listTaskRunsBySchedule,
		updateSchedule: mocks.updateSchedule,
	};
});

const { extrasRouter } = await import("../routers/extras");

const makePersistedSchedule = (
	overrides: Partial<PersistedSchedule> = {}
): PersistedSchedule => ({
	id: "schedule-1",
	profileId: "profile-route-1",
	type: "monitor",
	title: "Weekly review",
	content: "Check the system",
	triggerAt: "2026-06-01T00:00:00.000Z",
	cronExpr: "0 8 * * MON",
	timezone: "Asia/Shanghai",
	status: "active",
	lastTriggeredAt: null,
	deliveredAt: null,
	metadata: {
		localDisplay: "2026-06-01 08:00 Asia/Shanghai",
	},
	blueprint: null,
	createdAt: "2026-05-30T00:00:00.000Z",
	updatedAt: "2026-05-30T00:00:00.000Z",
	...overrides,
});

const makePersistedTaskRun = (
	overrides: Partial<PersistedTaskRun> = {}
): PersistedTaskRun => ({
	id: "task-run-1",
	profileId: "profile-route-1",
	scheduleId: "schedule-1",
	status: "succeeded",
	scheduledFor: "2026-06-01T00:00:00.000Z",
	promptSnapshot: "Run the weekly review",
	toolPolicySnapshot: null,
	inputSnapshot: null,
	attempt: 1,
	maxAttempts: 3,
	leaseOwner: null,
	leaseExpiresAt: null,
	heartbeatAt: null,
	nextRetryAt: null,
	runtimeTurnId: "turn-1",
	result: {
		assistantText: "Weekly review complete",
	},
	error: null,
	createdAt: "2026-05-30T00:00:00.000Z",
	startedAt: "2026-06-01T00:00:00.000Z",
	finishedAt: "2026-06-01T00:00:05.000Z",
	updatedAt: "2026-06-01T00:00:05.000Z",
	...overrides,
});

describe("schedule routes", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-30T00:00:00.000Z"));
		mocks.appendEvent.mockReturnValue(
			Effect.succeed({
				id: "event-1",
				profileId: "profile-route-1",
				type: "schedule.created",
				payload: {},
				createdAt: "2026-05-30T00:00:00.000Z",
			})
		);
		mocks.createSchedule.mockImplementation(
			(
				profileId: string,
				input: Omit<
					PersistedSchedule,
					| "id"
					| "profileId"
					| "status"
					| "lastTriggeredAt"
					| "deliveredAt"
					| "createdAt"
					| "updatedAt"
				>
			) =>
				Effect.succeed({
					id: "schedule-1",
					profileId,
					type: input.type,
					title: input.title,
					content: input.content,
					triggerAt: input.triggerAt,
					cronExpr: input.cronExpr,
					timezone: input.timezone,
					status: "active" as const,
					lastTriggeredAt: null,
					deliveredAt: null,
					metadata: input.metadata,
					createdAt: "2026-05-30T00:00:00.000Z",
					updatedAt: "2026-05-30T00:00:00.000Z",
				})
		);
		mocks.deleteSchedule.mockReturnValue(Effect.succeed({ deleted: true }));
		mocks.getSchedule.mockReturnValue(Effect.succeed(makePersistedSchedule()));
		mocks.listSchedules.mockReturnValue(Effect.succeed([]));
		mocks.listTaskRunsBySchedule.mockReturnValue(Effect.succeed([]));
		mocks.updateSchedule.mockImplementation(
			(scheduleId: string, input: Partial<PersistedSchedule>) =>
				Effect.succeed(
					makePersistedSchedule({
						id: scheduleId,
						...input,
						metadata: input.metadata ?? makePersistedSchedule().metadata,
					})
				)
		);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("plans the next trigger for cron-backed schedules", async () => {
		const schedule = await call(
			extrasRouter.schedules.create,
			{
				type: "monitor",
				title: "Weekly review",
				content: "Check the system",
				triggerAt: null,
				cronExpr: "0 8 * * MON",
				timezone: "Asia/Shanghai",
				metadata: {},
			},
			{ context: createTestContext("profile-route-1") }
		);

		expect(mocks.createSchedule.mock.lastCall?.[0]).toBe("profile-route-1");
		expect(mocks.createSchedule.mock.lastCall?.[1]).toMatchObject({
			triggerAt: "2026-06-01T00:00:00.000Z",
			cronExpr: "0 8 * * MON",
			timezone: "Asia/Shanghai",
			metadata: {
				localDisplay: "2026-06-01 08:00 Asia/Shanghai",
			},
		});
		expect(schedule.triggerAt).toBe("2026-06-01T00:00:00.000Z");
		expect(schedule.metadata.localDisplay).toBe(
			"2026-06-01 08:00 Asia/Shanghai"
		);
	});

	test("returns schedules with latest task run summary", async () => {
		mocks.listSchedules.mockReturnValueOnce(
			Effect.succeed([
				makePersistedSchedule({ id: "schedule-1", title: "Weekly review" }),
				makePersistedSchedule({ id: "schedule-2", title: "Morning briefing" }),
			] as never)
		);
		mocks.listTaskRunsBySchedule.mockImplementation((scheduleId: string) =>
			Effect.succeed(
				scheduleId === "schedule-1"
					? [
							makePersistedTaskRun({
								id: "task-run-1",
								scheduleId,
								status: "failed",
								error: {
									message: "provider timeout",
								},
							}),
						]
					: []
			)
		);

		const data = await call(extrasRouter.schedules.list, undefined, {
			context: createTestContext("profile-route-1"),
		});

		expect(data).toHaveLength(2);
		expect(data[0]).toMatchObject({
			id: "schedule-1",
			latestTaskRun: {
				id: "task-run-1",
				status: "failed",
				error: {
					message: "provider timeout",
				},
			},
		});
		expect(data[1]).toMatchObject({
			id: "schedule-2",
			latestTaskRun: null,
		});
		expect(mocks.listTaskRunsBySchedule).toHaveBeenCalledWith("schedule-1", {
			limit: 1,
		});
	});

	test("returns one schedule", async () => {
		mocks.getSchedule.mockReturnValueOnce(
			Effect.succeed(
				makePersistedSchedule({ id: "schedule-9", title: "Ops audit" })
			)
		);

		const data = await call(
			extrasRouter.schedules.get,
			{ scheduleId: "schedule-9" },
			{ context: createTestContext("profile-route-1") }
		);

		expect(data).toMatchObject({
			id: "schedule-9",
			title: "Ops audit",
		});
	});

	test("returns run history", async () => {
		mocks.getSchedule.mockReturnValueOnce(
			Effect.succeed(makePersistedSchedule({ id: "schedule-7" }))
		);
		mocks.listTaskRunsBySchedule.mockReturnValueOnce(
			Effect.succeed([
				makePersistedTaskRun({ id: "task-run-9", scheduleId: "schedule-7" }),
			] as never)
		);

		const data = await call(
			extrasRouter.schedules.listTaskRuns,
			{ scheduleId: "schedule-7", limit: 5 },
			{ context: createTestContext("profile-route-1") }
		);

		const listTaskRunsCall = mocks.listTaskRunsBySchedule.mock.calls[0] as
			| unknown[]
			| undefined;
		expect(listTaskRunsCall?.[0]).toBe("schedule-7");
		expect(listTaskRunsCall?.[1]).toEqual({
			limit: 5,
		});
		expect(data).toHaveLength(1);
		expect(data[0]).toMatchObject({
			id: "task-run-9",
			scheduleId: "schedule-7",
		});
	});

	test("rejects malformed cron expressions", async () => {
		const error = await captureOrpcError(() =>
			call(
				extrasRouter.schedules.create,
				{
					type: "monitor",
					title: "Broken schedule",
					content: "This should fail",
					triggerAt: null,
					cronExpr: "not-a-cron",
					timezone: "Asia/Shanghai",
					metadata: {},
				},
				{ context: createTestContext("profile-route-1") }
			)
		);

		expect(error.code).toBe("BAD_REQUEST");
		expect(error.message).toContain("cronExpr");
		expect(mocks.createSchedule.mock.calls).toHaveLength(0);
	});

	test("rejects an explicit triggerAt that does not match cronExpr", async () => {
		const error = await captureOrpcError(() =>
			call(
				extrasRouter.schedules.update,
				{ scheduleId: "schedule-1", triggerAt: "2026-05-30T00:00:00.000Z" },
				{ context: createTestContext("profile-route-1") }
			)
		);

		expect(error.code).toBe("BAD_REQUEST");
		expect(error.message).toContain("triggerAt");
		expect(mocks.getSchedule.mock.calls).toHaveLength(1);
		expect(mocks.updateSchedule.mock.calls).toHaveLength(0);
	});
});
