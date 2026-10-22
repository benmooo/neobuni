import { Effect } from "effect";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	recordDecisionTrace: vi.fn(),
	decide: vi.fn(),
}));

vi.mock("@neobuni/db", () => ({
	recordDecisionTrace: mocks.recordDecisionTrace,
}));
vi.mock("./jev-provider-config", () => ({
	getConfiguredJevProvider: async () => ({ decide: mocks.decide }),
	getJevRuntimeConfig: async () => ({
		metadata: {
			timeoutMs: 3000,
			maxRetries: 1,
			retrievalShadowEnabled: true,
			graphV2ShadowEnabled: false,
			evidenceRelevanceShadowEnabled: false,
			retrievalRoutingEnabled: true,
			retrievalConfidenceThreshold: 0.85,
			retrievalMinComparedPairs: 0,
			retrievalMinAgreementRate: 0,
			retrievalMaxAverageLatencyMs: 3000,
			retrievalMaxProviderErrorRate: 0.05,
			nextActionShadowEnabled: true,
		},
	}),
}));

mocks.recordDecisionTrace.mockImplementation((input: Record<string, unknown>) =>
	Effect.succeed({
		...(input.decision as Record<string, unknown>),
	})
);
mocks.decide.mockResolvedValue({
	providerId: "jev",
	providerVersion: "jev-1.14.0",
	latencyMs: 1,
	answers: [
		{
			questionId: "initiative.best_candidate.v1",
			kind: "choice",
			selectedValue: "commitment:blocked",
			probabilities: { "commitment:blocked": 0.8 },
			confidence: 0.8,
		},
		{
			questionId: "initiative.interruption_value.v1",
			kind: "score",
			selectedValue: 0.7,
			probabilities: {},
			confidence: 0.8,
		},
	],
});

const { recordNextActionEvaluation } = await import(
	"./next-action-evaluation-service"
);

const goal = {
	id: "goal-1",
	profileId: "profile-1",
	title: "Ship",
	desiredOutcome: "Ship the work",
	status: "active" as const,
	horizon: "project" as const,
	successCriteria: [],
	constraints: [],
	autonomyMode: "collaborate" as const,
	planVersion: 0,
	nextReviewAt: null,
	createdAt: "2026-10-21T00:00:00.000Z",
	updatedAt: "2026-10-21T00:00:00.000Z",
};

afterEach(() => {
	mocks.recordDecisionTrace.mockClear();
	mocks.decide.mockClear();
});

describe("recordNextActionEvaluation", () => {
	test("persists the heuristic and Jev judgments side by side without changing the selected action", async () => {
		const result = await Effect.runPromise(
			recordNextActionEvaluation({
				profileId: "profile-1",
				goals: [goal],
				commitments: [
					{
						id: "blocked",
						profileId: "profile-1",
						goalId: "goal-1",
						kind: "dependency",
						status: "blocked",
						owner: "external",
						title: "Wait for API",
						dueAt: null,
						evidenceIds: [],
						createdAt: goal.createdAt,
						updatedAt: goal.updatedAt,
					},
				],
				goalId: "goal-1",
				trigger: "explicit_now_evaluation",
			})
		);
		expect(result.suggestedAction?.id).toBe("commitment:blocked");
		expect(mocks.decide).toHaveBeenCalledTimes(1);
		expect(mocks.recordDecisionTrace.mock.calls[0]?.[0]).toMatchObject({
			decision: {
				route: "suggest",
				policyResult: {
					reasons: ["advisory_next_action_only", "jev_shadow_observed"],
				},
			},
			judgments: [
				{ provider: "heuristic", selectedValue: "commitment:blocked" },
				{
					provider: "heuristic",
					questionId: "initiative.interruption_value.v1",
					selectedValue: 0.75,
				},
				{ provider: "jev", selectedValue: "commitment:blocked" },
				{
					provider: "jev",
					questionId: "initiative.interruption_value.v1",
					selectedValue: 0.7,
				},
			],
		});
	});
});
