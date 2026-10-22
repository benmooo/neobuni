import { call } from "@orpc/server";
import { Effect } from "effect";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { captureOrpcError, createTestContext } from "./test-support";

const mocks = vi.hoisted(() => ({
	appendEvent: vi.fn(),
	cancelActionRun: vi.fn(),
	confirmActionRunReceipt: vi.fn(),
	createActionAuthorization: vi.fn(),
	createActionProposal: vi.fn(),
	createActionRun: vi.fn(),
	createCommitment: vi.fn(),
	createGoal: vi.fn(),
	getActionAuthorization: vi.fn(),
	getActionProposal: vi.fn(),
	getActionRun: vi.fn(),
	getActionRunByProposal: vi.fn(),
	getDecisionJevProviderConfig: vi.fn(),
	getDecisionTrace: vi.fn(),
	getGoal: vi.fn(),
	listCommitments: vi.fn(),
	listDecisionTracesByGoal: vi.fn(),
	listDecisionTracesByProfile: vi.fn(),
	listGoals: vi.fn(),
	recordDecisionFeedback: vi.fn(),
	recordDecisionTrace: vi.fn(),
	updateActionProposalStatus: vi.fn(),
	updateCommitment: vi.fn(),
	updateGoal: vi.fn(),
	getEffectiveTelegramConfig: vi.fn(),
	recordNextActionEvaluation: vi.fn(),
}));

vi.mock("@neobuni/db", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@neobuni/db")>();
	return {
		...actual,
		appendEvent: mocks.appendEvent,
		cancelActionRun: mocks.cancelActionRun,
		confirmActionRunReceipt: mocks.confirmActionRunReceipt,
		createActionAuthorization: mocks.createActionAuthorization,
		createActionProposal: mocks.createActionProposal,
		createActionRun: mocks.createActionRun,
		createCommitment: mocks.createCommitment,
		createGoal: mocks.createGoal,
		getActionAuthorization: mocks.getActionAuthorization,
		getActionProposal: mocks.getActionProposal,
		getActionRun: mocks.getActionRun,
		getActionRunByProposal: mocks.getActionRunByProposal,
		getDecisionJevProviderConfig: mocks.getDecisionJevProviderConfig,
		getDecisionTrace: mocks.getDecisionTrace,
		getGoal: mocks.getGoal,
		listCommitments: mocks.listCommitments,
		listDecisionTracesByGoal: mocks.listDecisionTracesByGoal,
		listDecisionTracesByProfile: mocks.listDecisionTracesByProfile,
		listGoals: mocks.listGoals,
		recordDecisionFeedback: mocks.recordDecisionFeedback,
		recordDecisionTrace: mocks.recordDecisionTrace,
		updateActionProposalStatus: mocks.updateActionProposalStatus,
		updateCommitment: mocks.updateCommitment,
		updateGoal: mocks.updateGoal,
	};
});
vi.mock("../decision/next-action-evaluation-service", () => ({
	recordNextActionEvaluation: mocks.recordNextActionEvaluation,
}));
vi.mock("../integrations/telegram", () => ({
	getEffectiveTelegramConfig: mocks.getEffectiveTelegramConfig,
}));

const { extrasRouter } = await import("../routers/extras");

const makeGoal = (overrides: Record<string, unknown> = {}) => ({
	id: "goal-1",
	profileId: "profile-1",
	title: "Goal",
	desiredOutcome: "Outcome",
	status: "active",
	horizon: "project",
	successCriteria: [],
	constraints: [],
	autonomyMode: "collaborate",
	planVersion: 0,
	nextReviewAt: null,
	createdAt: "2026-10-21T00:00:00.000Z",
	updatedAt: "2026-10-21T00:00:00.000Z",
	...overrides,
});

const telegramConfig = {
	enabled: true,
	targets: [
		{
			alias: "daily_digest",
			label: "Daily digest",
			targetType: "channel",
			enabled: true,
		},
	],
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.appendEvent.mockReturnValue(Effect.succeed(null));
	mocks.createGoal.mockImplementation((input: Record<string, unknown>) =>
		Effect.succeed({
			id: "goal-1",
			...input,
			createdAt: "2026-10-21T00:00:00.000Z",
			updatedAt: "2026-10-21T00:00:00.000Z",
		})
	);
	mocks.getGoal.mockReturnValue(Effect.succeed(makeGoal()));
	mocks.listGoals.mockReturnValue(Effect.succeed([]));
	mocks.listCommitments.mockReturnValue(Effect.succeed([]));
	mocks.listDecisionTracesByGoal.mockReturnValue(Effect.succeed([]));
	mocks.listDecisionTracesByProfile.mockReturnValue(Effect.succeed([]));
	mocks.createCommitment.mockReturnValue(
		Effect.succeed({ id: "commitment-1" })
	);
	mocks.updateGoal.mockImplementation((input: Record<string, unknown>) =>
		Effect.succeed({
			id: "goal-1",
			profileId: "profile-1",
			...(input.patch as Record<string, unknown>),
		})
	);
	mocks.updateCommitment.mockImplementation((input: Record<string, unknown>) =>
		Effect.succeed({
			id: "commitment-1",
			profileId: "profile-1",
			goalId: "goal-1",
			...(input.patch as Record<string, unknown>),
		})
	);
	mocks.getDecisionJevProviderConfig.mockReturnValue(Effect.succeed(null));
	mocks.getDecisionTrace.mockReturnValue(Effect.succeed(null));
	mocks.createActionProposal.mockImplementation(
		(input: Record<string, unknown>) =>
			Effect.succeed({ id: "proposal-1", ...input })
	);
	mocks.getActionProposal.mockReturnValue(Effect.succeed(null));
	mocks.getActionAuthorization.mockReturnValue(Effect.succeed(null));
	mocks.getActionRun.mockReturnValue(Effect.succeed(null));
	mocks.getActionRunByProposal.mockReturnValue(Effect.succeed(null));
	mocks.createActionRun.mockImplementation((input: Record<string, unknown>) =>
		Effect.succeed({ id: "action-run-1", ...input })
	);
	mocks.cancelActionRun.mockReturnValue(Effect.succeed(null));
	mocks.confirmActionRunReceipt.mockReturnValue(Effect.succeed(null));
	mocks.updateActionProposalStatus.mockReturnValue(Effect.succeed(null));
	mocks.createActionAuthorization.mockImplementation(
		(input: Record<string, unknown>) =>
			Effect.succeed({ id: "authorization-1", ...input })
	);
	mocks.getEffectiveTelegramConfig.mockResolvedValue(telegramConfig);
	mocks.recordDecisionFeedback.mockImplementation(
		(input: Record<string, unknown>) =>
			Effect.succeed({ id: "feedback-1", ...input })
	);
	mocks.recordDecisionTrace.mockImplementation(
		(input: Record<string, unknown>) =>
			Effect.succeed({
				id: (input.decision as { id: string }).id,
				...(input.decision as Record<string, unknown>),
			})
	);
	mocks.recordNextActionEvaluation.mockImplementation(() =>
		Effect.succeed({
			decision: { id: "decision-1" },
			suggestedAction: null,
			candidates: [],
		})
	);
});

describe("goal routes", () => {
	test("creates explicit goals with collaboration as the safe default", async () => {
		const goal = await call(
			extrasRouter.goals.create,
			{
				title: "Ship Decision OS",
				desiredOutcome: "Decision traces work.",
			},
			{ context: createTestContext() }
		);

		expect(goal.id).toBe("goal-1");
		expect(mocks.createGoal.mock.calls[0]?.[0]).toMatchObject({
			profileId: "profile-1",
			autonomyMode: "collaborate",
			status: "draft",
		});
	});

	test("returns the goal read model", async () => {
		const result = await call(
			extrasRouter.goals.get,
			{ goalId: "goal-1" },
			{ context: createTestContext() }
		);

		expect(result.goal.id).toBe("goal-1");
	});

	test("updates an owned goal so a draft can become active", async () => {
		await call(
			extrasRouter.goals.update,
			{ goalId: "goal-1", status: "active", nextReviewAt: null },
			{ context: createTestContext() }
		);

		expect(mocks.updateGoal.mock.calls.at(-1)?.[0]).toMatchObject({
			profileId: "profile-1",
			goalId: "goal-1",
			patch: { status: "active", nextReviewAt: null },
		});
	});

	test("does not expose a goal update outside the active profile", async () => {
		mocks.updateGoal.mockReturnValueOnce(Effect.succeed(null));

		const error = await captureOrpcError(() =>
			call(
				extrasRouter.goals.update,
				{ goalId: "other-profile-goal", status: "active" },
				{ context: createTestContext() }
			)
		);

		expect(error.code).toBe("NOT_FOUND");
		expect(mocks.updateGoal.mock.calls.at(-1)?.[0]).toMatchObject({
			profileId: "profile-1",
			goalId: "other-profile-goal",
		});
	});

	test("scopes a commitment update to its owned goal", async () => {
		await call(
			extrasRouter.goals.commitments.update,
			{ goalId: "goal-1", commitmentId: "commitment-1", status: "done" },
			{ context: createTestContext() }
		);

		expect(mocks.updateCommitment.mock.calls.at(-1)?.[0]).toMatchObject({
			profileId: "profile-1",
			goalId: "goal-1",
			commitmentId: "commitment-1",
		});
	});

	test("returns a single Now projection for active goals and open commitments", async () => {
		mocks.listGoals.mockReturnValueOnce(
			Effect.succeed([
				makeGoal({ nextReviewAt: "2026-10-22T00:00:00.000Z" }),
			] as never)
		);
		mocks.listCommitments.mockReturnValueOnce(
			Effect.succeed([
				{
					id: "commitment-1",
					profileId: "profile-1",
					goalId: "goal-1",
					kind: "task",
					status: "open",
					owner: "user",
					title: "Review trace",
					dueAt: null,
					evidenceIds: [],
					createdAt: "2026-10-21T00:00:00.000Z",
					updatedAt: "2026-10-21T00:00:00.000Z",
				},
			] as never)
		);
		mocks.listDecisionTracesByGoal.mockReturnValueOnce(
			Effect.succeed([] as never)
		);

		const result = await call(extrasRouter.goals.now, undefined, {
			context: createTestContext(),
		});

		expect(result).toMatchObject({
			nextReviewAt: "2026-10-22T00:00:00.000Z",
		});
		expect(result.openCommitments).toHaveLength(1);
	});

	test("returns a read-only evaluation summary from persisted decision traces", async () => {
		mocks.listDecisionTracesByProfile.mockReturnValueOnce(
			Effect.succeed([] as never)
		);

		const result = await call(
			extrasRouter.goals.decisionEvaluation,
			undefined,
			{
				context: createTestContext(),
			}
		);

		expect(result).toMatchObject({
			totalDecisions: 0,
			agreementRate: null,
			retrievalRoutingSummary: {
				totalDecisions: 0,
				agreementRate: null,
			},
			initiativeInterruptionSummary: {
				totalDecisions: 0,
				agreementRate: null,
			},
		});
	});

	test("records a next-action trace only after an explicit evaluation request", async () => {
		mocks.listGoals.mockReturnValueOnce(Effect.succeed([makeGoal()] as never));
		mocks.listCommitments.mockReturnValueOnce(Effect.succeed([] as never));

		await call(
			extrasRouter.goals.nextActionEvaluations,
			{ goalId: "goal-1" },
			{ context: createTestContext() }
		);

		expect(mocks.recordNextActionEvaluation.mock.calls[0]?.[0]).toMatchObject({
			goalId: "goal-1",
			trigger: "explicit_now_evaluation",
		});
	});

	test("records user feedback only for candidates in the decision trace", async () => {
		mocks.getDecisionTrace.mockReturnValueOnce(
			Effect.succeed({
				decision: { profileId: "profile-1" },
				candidates: [{ id: "candidate-1" }],
			} as never)
		);

		await call(
			extrasRouter.goals.decisions.feedback,
			{
				decisionId: "decision-1",
				kind: "accepted",
				candidateId: "candidate-1",
			},
			{ context: createTestContext() }
		);

		expect(mocks.recordDecisionFeedback.mock.calls.at(-1)?.[0]).toMatchObject({
			decisionId: "decision-1",
			candidateId: "candidate-1",
			kind: "accepted",
		});
	});

	test("creates a proposal only from an eligible candidate in the owned trace", async () => {
		mocks.getDecisionTrace.mockReturnValueOnce(
			Effect.succeed({
				decision: { profileId: "profile-1", goalId: "goal-1" },
				candidates: [
					{
						id: "candidate-1",
						kind: "next_action",
						title: "Review plan",
						reversibility: "reversible",
						authority: "confirmation",
						eligible: true,
					},
				],
			} as never)
		);

		await call(
			extrasRouter.goals.actionProposals.create,
			{
				decisionId: "decision-1",
				candidateId: "candidate-1",
				expectedOutcome: "A reviewed plan.",
			},
			{ context: createTestContext() }
		);

		expect(mocks.createActionProposal.mock.calls.at(-1)?.[0]).toMatchObject({
			decisionId: "decision-1",
			candidateId: "candidate-1",
			requiredAuthority: "confirmation",
			status: "proposed",
		});
	});

	test("lists only minimal configured Telegram channel targets", async () => {
		mocks.getEffectiveTelegramConfig.mockResolvedValueOnce({
			enabled: true,
			botToken: "secret-token",
			targets: [
				{
					alias: "daily_digest",
					label: "Daily digest",
					targetType: "channel",
					enabled: true,
				},
				{
					alias: "team_group",
					label: "Team group",
					targetType: "group",
					enabled: true,
				},
			],
		} as never);

		const result = await call(extrasRouter.goals.telegramTargets, undefined, {
			context: createTestContext(),
		});

		expect(result).toEqual([{ alias: "daily_digest", label: "Daily digest" }]);
	});

	test("creates a Telegram draft that requires a separate exact-target confirmation", async () => {
		await call(
			extrasRouter.goals.telegramDrafts,
			{
				goalId: "goal-1",
				targetAlias: "daily_digest",
				text: "今日摘要",
				expectedOutcome: "指定频道收到摘要。",
			},
			{ context: createTestContext() }
		);

		expect(mocks.recordDecisionTrace.mock.calls.at(-1)?.[0]).toMatchObject({
			decision: {
				kind: "planning_escalation",
				route: "request_confirmation",
			},
		});
		expect(mocks.createActionProposal.mock.calls.at(-1)?.[0]).toMatchObject({
			kind: "telegram_message",
			reversibility: "irreversible",
			input: {
				operation: "telegram_message_send",
				targetAlias: "daily_digest",
			},
		});
	});

	test("rejects non-channel and raw-ID Telegram draft targets", async () => {
		mocks.getEffectiveTelegramConfig.mockResolvedValue({
			enabled: true,
			botToken: "secret-token",
			targets: [
				{
					alias: "daily_digest",
					label: "Daily digest",
					targetType: "channel",
					enabled: true,
				},
				{
					alias: "team_group",
					label: "Team group",
					targetType: "group",
					enabled: true,
				},
			],
		} as never);

		const groupError = await captureOrpcError(() =>
			call(
				extrasRouter.goals.telegramDrafts,
				{
					targetAlias: "team_group",
					text: "今日摘要",
					expectedOutcome: "指定频道收到摘要。",
				},
				{ context: createTestContext() }
			)
		);
		const rawIdError = await captureOrpcError(() =>
			call(
				extrasRouter.goals.telegramDrafts,
				{
					targetId: "-1001",
					text: "今日摘要",
					expectedOutcome: "指定频道收到摘要。",
				},
				{ context: createTestContext() }
			)
		);

		expect(groupError.code).toBe("UNPROCESSABLE_CONTENT");
		expect(rawIdError.code).toBe("UNPROCESSABLE_CONTENT");
	});

	test("rejects execution authorization for a non-reversible proposal", async () => {
		mocks.getActionProposal.mockReturnValueOnce(
			Effect.succeed({
				id: "proposal-1",
				profileId: "profile-1",
			} as never)
		);

		const error = await captureOrpcError(() =>
			call(
				extrasRouter.goals.actionProposals.authorize,
				{ proposalId: "proposal-1", mode: "execute" },
				{ context: createTestContext() }
			)
		);

		expect(error.code).toBe("UNPROCESSABLE_CONTENT");
		expect(mocks.createActionAuthorization).not.toHaveBeenCalled();
	});

	test("queues only a candidate-bound run with an active execution authorization", async () => {
		mocks.getActionProposal.mockReturnValueOnce(
			Effect.succeed({
				id: "proposal-1",
				profileId: "profile-1",
				candidateId: "commitment:commitment-1",
				reversibility: "reversible",
				status: "authorized",
			} as never)
		);
		mocks.getActionAuthorization.mockReturnValueOnce(
			Effect.succeed({
				id: "authorization-1",
				proposalId: "proposal-1",
				profileId: "profile-1",
				mode: "execute",
				grantedBy: "user",
				expiresAt: null,
				revokedAt: null,
			} as never)
		);
		mocks.getActionRunByProposal.mockReturnValueOnce(Effect.succeed(null));

		await call(
			extrasRouter.goals.actionProposals.createRun,
			{
				proposalId: "proposal-1",
				authorizationId: "authorization-1",
				input: {
					operation: "commitment_status_update",
					commitmentId: "commitment-1",
					expectedStatus: "open",
					nextStatus: "done",
				},
			},
			{ context: createTestContext() }
		);

		expect(mocks.createActionRun.mock.calls.at(-1)?.[0]).toMatchObject({
			proposalId: "proposal-1",
			authorizationId: "authorization-1",
			profileId: "profile-1",
		});
	});

	test("records user confirmation of a Telegram platform receipt", async () => {
		mocks.getActionRun.mockReturnValueOnce(
			Effect.succeed({
				id: "action-run-1",
				profileId: "profile-1",
			} as never)
		);
		mocks.confirmActionRunReceipt.mockReturnValueOnce(
			Effect.succeed({
				id: "action-run-1",
				proposalId: "proposal-1",
				receipt: {
					kind: "telegram_send_message",
					status: "external_confirmed",
				},
			} as never)
		);

		await call(
			extrasRouter.goals.actionRuns.confirmReceipt,
			{ actionRunId: "action-run-1" },
			{ context: createTestContext() }
		);

		expect(mocks.confirmActionRunReceipt).toHaveBeenCalledWith("action-run-1");
	});
});
