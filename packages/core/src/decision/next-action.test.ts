import { describe, expect, test } from "vitest"
import {
  buildNextActionCandidates,
  selectHeuristicNextAction,
} from "./next-action"

const goal = {
  id: "goal-1",
  profileId: "profile-1",
  title: "Ship",
  desiredOutcome: "Ship it",
  status: "active" as const,
  horizon: "project" as const,
  successCriteria: [],
  constraints: [],
  autonomyMode: "collaborate" as const,
  planVersion: 0,
  nextReviewAt: null,
  createdAt: "2026-10-21T00:00:00.000Z",
  updatedAt: "2026-10-21T00:00:00.000Z",
}

describe("next action candidates", () => {
  test("prioritizes a blocked commitment over open work", () => {
    const candidates = buildNextActionCandidates({
      goals: [goal],
      commitments: [
        {
          id: "open",
          profileId: "profile-1",
          goalId: "goal-1",
          kind: "task",
          status: "open",
          owner: "user",
          title: "Write spec",
          dueAt: null,
          evidenceIds: [],
          createdAt: goal.createdAt,
          updatedAt: goal.updatedAt,
        },
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
    })
    expect(selectHeuristicNextAction(candidates)?.id).toBe("commitment:blocked")
  })
})
