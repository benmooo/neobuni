import { describe, expect, test } from "vitest";
import { isGoalReviewDue } from "./initiative-schedule";

const goal = {
  id: "goal-1",
  profileId: "profile-1",
  title: "Goal",
  desiredOutcome: "Outcome",
  status: "active" as const,
  horizon: "project" as const,
  successCriteria: [],
  constraints: [],
  autonomyMode: "collaborate" as const,
  planVersion: 0,
  nextReviewAt: null,
  createdAt: "2026-10-20T00:00:00.000Z",
  updatedAt: "2026-10-20T00:00:00.000Z",
};

describe("isGoalReviewDue", () => {
  test("reviews an unreviewed active goal and respects the minimum interval", () => {
    expect(
      isGoalReviewDue({
        goal,
        lastDecisionAt: null,
        nowIso: "2026-10-21T00:00:00.000Z",
        minIntervalMs: 60_000,
      })
    ).toBe(true);
    expect(
      isGoalReviewDue({
        goal,
        lastDecisionAt: "2026-10-21T00:00:00.000Z",
        nowIso: "2026-10-21T00:00:30.000Z",
        minIntervalMs: 60_000,
      })
    ).toBe(false);
  });
  test("honors each due review point once, then returns to the minimum interval", () => {
    expect(
      isGoalReviewDue({
        goal: { ...goal, nextReviewAt: "2026-10-20T23:00:00.000Z" },
        lastDecisionAt: "2026-10-20T22:00:00.000Z",
        nowIso: "2026-10-21T00:00:01.000Z",
        minIntervalMs: 60_000,
      })
    ).toBe(true);
    expect(
      isGoalReviewDue({
        goal: { ...goal, nextReviewAt: "2026-10-20T23:00:00.000Z" },
        lastDecisionAt: "2026-10-21T00:00:00.000Z",
        nowIso: "2026-10-21T00:00:01.000Z",
        minIntervalMs: 60_000,
      })
    ).toBe(false);
  });
  test("never reviews inactive goals", () => {
    expect(
      isGoalReviewDue({
        goal: { ...goal, status: "paused" },
        lastDecisionAt: null,
        nowIso: "2026-10-21T00:00:00.000Z",
        minIntervalMs: 60_000,
      })
    ).toBe(false);
  });
});
