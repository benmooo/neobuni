import { Effect } from "effect";
import { describe, expect, test } from "vitest";
import {
  readInitiativeWorkerConfig,
  runInitiativeWorkerSweep,
} from "./initiative-worker";

const nowIso = "2026-10-21T00:00:00.000Z";
const goal = {
  id: "goal-1",
  profileId: "profile-1",
  title: "Ship",
  desiredOutcome: "Done",
  status: "active" as const,
  horizon: "project" as const,
  successCriteria: [],
  constraints: [],
  autonomyMode: "collaborate" as const,
  planVersion: 0,
  nextReviewAt: null,
  createdAt: nowIso,
  updatedAt: nowIso,
};

describe("runInitiativeWorkerSweep", () => {
  test("enables advisory reviews by default", () => {
    const previous = process.env.NEOBUNI_GOAL_INITIATIVE_ENABLED;
    delete process.env.NEOBUNI_GOAL_INITIATIVE_ENABLED;
    expect(readInitiativeWorkerConfig().enabled).toBe(true);
    if (previous === undefined) {
      delete process.env.NEOBUNI_GOAL_INITIATIVE_ENABLED;
    } else {
      process.env.NEOBUNI_GOAL_INITIATIVE_ENABLED = previous;
    }
  });
  test("records an advisory decision for an unreviewed active goal", async () => {
    const events: string[] = [];
    const result = await Effect.runPromise(
      runInitiativeWorkerSweep({
        nowIso,
        config: { enabled: true, tickMs: 10_000, minReviewIntervalMs: 60_000 },
        deps: {
          listActiveProfiles: () =>
            Effect.succeed([{ id: "profile-1" }] as never),
          listGoals: () => Effect.succeed([goal]),
          listCommitments: () => Effect.succeed([]),
          listDecisionTracesByGoal: () => Effect.succeed([]),
          recordNextActionEvaluation: () =>
            Effect.succeed({
              decision: { id: "decision-1", route: "suggest" },
            } as never),
          appendEvent: (_profileId, type) => {
            events.push(type);
            return Effect.succeed(null as never);
          },
        },
      })
    );
    expect(result.profileResults).toEqual([
      { profileId: "profile-1", evaluatedDecisionIds: ["decision-1"] },
    ]);
    expect(events).toEqual(["goal.initiative_evaluated"]);
  });
  test("does not evaluate a goal whose last decision is still inside the interval", async () => {
    let evaluated = false;
    await Effect.runPromise(
      runInitiativeWorkerSweep({
        nowIso,
        config: { enabled: true, tickMs: 10_000, minReviewIntervalMs: 60_000 },
        deps: {
          listActiveProfiles: () =>
            Effect.succeed([{ id: "profile-1" }] as never),
          listGoals: () => Effect.succeed([goal]),
          listCommitments: () => Effect.succeed([]),
          listDecisionTracesByGoal: () =>
            Effect.succeed([{ createdAt: nowIso }] as never),
          recordNextActionEvaluation: () => {
            evaluated = true;
            return Effect.succeed({} as never);
          },
        },
      })
    );
    expect(evaluated).toBe(false);
  });
});
