import { isGoalReviewDue } from "@neobuni/core";
import {
  appendEvent,
  listActiveProfiles,
  listCommitments,
  listDecisionTracesByGoal,
  listGoals,
} from "@neobuni/db";
import { Effect } from "../effect";
import { recordNextActionEvaluation } from "./next-action-evaluation-service";

interface InitiativeWorkerConfig {
  enabled: boolean;
  minReviewIntervalMs: number;
  tickMs: number;
}
interface InitiativeWorkerDeps {
  appendEvent: typeof appendEvent;
  listActiveProfiles: typeof listActiveProfiles;
  listCommitments: typeof listCommitments;
  listDecisionTracesByGoal: typeof listDecisionTracesByGoal;
  listGoals: typeof listGoals;
  recordNextActionEvaluation: typeof recordNextActionEvaluation;
}
interface InitiativeWorkerProfileResult {
  evaluatedDecisionIds: string[];
  profileId: string;
}
const defaults: InitiativeWorkerConfig = {
  enabled: true,
  tickMs: 300_000,
  minReviewIntervalMs: 3_600_000,
};
const defaultDeps: InitiativeWorkerDeps = {
  appendEvent,
  listActiveProfiles,
  listCommitments,
  listDecisionTracesByGoal,
  listGoals,
  recordNextActionEvaluation,
};
const toBoolean = (value: string | undefined, fallback: boolean) =>
  value === undefined
    ? fallback
    : ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())
      ? true
      : ["0", "false", "no", "off"].includes(value.trim().toLowerCase())
        ? false
        : fallback;
const toPositiveInt = (
  value: string | undefined,
  fallback: number,
  min: number
) => {
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(min, Math.trunc(parsed)) : fallback;
};
const readInitiativeWorkerConfig = (): InitiativeWorkerConfig => ({
  enabled: toBoolean(
    process.env.NEOBUNI_GOAL_INITIATIVE_ENABLED,
    defaults.enabled
  ),
  tickMs: toPositiveInt(
    process.env.NEOBUNI_GOAL_INITIATIVE_TICK_MS,
    defaults.tickMs,
    10_000
  ),
  minReviewIntervalMs: toPositiveInt(
    process.env.NEOBUNI_GOAL_INITIATIVE_MIN_REVIEW_INTERVAL_MS,
    defaults.minReviewIntervalMs,
    60_000
  ),
});
const runInitiativeWorkerSweep = Effect.fnUntraced(function* (input?: {
  nowIso?: string;
  config?: InitiativeWorkerConfig;
  deps?: Partial<InitiativeWorkerDeps>;
}) {
  const deps = { ...defaultDeps, ...input?.deps };
  const nowIso = input?.nowIso ?? new Date().toISOString();
  const config = input?.config ?? readInitiativeWorkerConfig();
  const profileResults: InitiativeWorkerProfileResult[] = [];
  const profiles = yield* deps.listActiveProfiles();
  for (const profile of profiles) {
    const [goals, commitments] = yield* Effect.all(
      [deps.listGoals(profile.id, "active"), deps.listCommitments(profile.id)],
      { concurrency: "unbounded" }
    );
    const withLatest = yield* Effect.forEach(
      goals,
      (goal) =>
        deps
          .listDecisionTracesByGoal(profile.id, goal.id)
          .pipe(Effect.map((traces) => ({ goal, latest: traces[0] ?? null }))),
      { concurrency: "unbounded" }
    );
    const dueGoals = withLatest
      .filter(({ goal, latest }) =>
        isGoalReviewDue({
          goal,
          lastDecisionAt: latest?.createdAt ?? null,
          nowIso,
          minIntervalMs: config.minReviewIntervalMs,
        })
      )
      .map(({ goal }) => goal);
    const evaluatedDecisionIds = yield* Effect.forEach(
      dueGoals,
      (goal) =>
        Effect.gen(function* () {
          const data = yield* deps.recordNextActionEvaluation({
            profileId: profile.id,
            goals,
            commitments,
            goalId: goal.id,
            trigger: "scheduled_goal_review",
          });
          yield* deps.appendEvent(profile.id, "goal.initiative_evaluated", {
            goalId: goal.id,
            decisionId: data.decision.id,
            route: data.decision.route,
          });
          return data.decision.id;
        }),
      { concurrency: "unbounded" }
    );
    profileResults.push({ profileId: profile.id, evaluatedDecisionIds });
  }
  return { startedAt: nowIso, profileResults };
});
const startInitiativeWorker = Effect.fnUntraced(function* () {
  const config = readInitiativeWorkerConfig();
  if (!config.enabled) {
    yield* Effect.logInfo(
      "[buni/initiative-worker] disabled via NEOBUNI_GOAL_INITIATIVE_ENABLED"
    );
    return;
  }
  yield* Effect.logInfo(
    `[buni/initiative-worker] started tickMs=${config.tickMs} minReviewIntervalMs=${config.minReviewIntervalMs}`
  );
  yield* Effect.forever(
    Effect.gen(function* () {
      yield* runInitiativeWorkerSweep({ config }).pipe(
        Effect.catch((error) =>
          Effect.logError("[buni/initiative-worker] sweep failed", error)
        ),
        Effect.catchDefect((defect) =>
          Effect.logError("[buni/initiative-worker] sweep defect", defect)
        )
      );
      yield* Effect.sleep(config.tickMs);
    })
  );
});

export type { InitiativeWorkerConfig, InitiativeWorkerDeps };
export {
  readInitiativeWorkerConfig,
  runInitiativeWorkerSweep,
  startInitiativeWorker,
};
