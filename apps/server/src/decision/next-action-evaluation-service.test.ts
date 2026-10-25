import { Effect } from "effect";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordDecisionTrace: vi.fn(),
}));

vi.mock("@neobuni/db", () => ({
  recordDecisionTrace: mocks.recordDecisionTrace,
}));

mocks.recordDecisionTrace.mockImplementation((input: Record<string, unknown>) =>
  Effect.succeed({
    ...(input.decision as Record<string, unknown>),
  })
);

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
});

describe("recordNextActionEvaluation", () => {
  test("selects the highest-priority commitment and records an advisory trace", async () => {
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
    expect(mocks.recordDecisionTrace).toHaveBeenCalledTimes(1);
    const recorded = mocks.recordDecisionTrace.mock.calls[0]?.[0] as {
      decision: {
        route: string;
        policyResult: { reasons: string[] };
      };
      candidates: unknown[];
      judgments?: unknown;
    };
    expect(recorded.decision.route).toBe("suggest");
    expect(recorded.decision.policyResult.reasons).toEqual([
      "advisory_next_action_only",
    ]);
    expect(recorded.candidates).toHaveLength(1);
    expect(recorded).not.toHaveProperty("judgments");
  });

  test("stays silent when there is no eligible commitment", async () => {
    const result = await Effect.runPromise(
      recordNextActionEvaluation({
        profileId: "profile-1",
        goals: [goal],
        commitments: [],
        goalId: "goal-1",
        trigger: "scheduled_goal_review",
      })
    );

    expect(result.suggestedAction).toBeNull();
    const recorded = mocks.recordDecisionTrace.mock.calls[0]?.[0] as {
      decision: {
        route: string;
        policyResult: { reasons: string[] };
      };
    };
    expect(recorded.decision.route).toBe("stay_silent");
    expect(recorded.decision.policyResult.reasons).toEqual([
      "no_eligible_candidate",
    ]);
  });
});
