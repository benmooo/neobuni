/**
 * Manual smoke probe for the Study Scout pipeline.
 *
 * Runs `previewStudyScout` against the local database, which is the same path
 * `POST /study/goals/{goalId}/scout/run` uses. It finds the newest goal that
 * has a study configuration when `GOAL_ID` is not given, so it needs no auth
 * cookie and no running server.
 *
 * Usage:
 *   DATABASE_URL=file:/abs/path/.data/local.db \
 *     bun run apps/server/scripts/study-scout-smoke.ts
 *   DATABASE_URL=... GOAL_ID=... bun run ...
 *
 * Exit codes: 0 when a digest could be produced, 1 when Scout is unavailable
 * (missing search key, no active plan) or returned no candidates.
 */

import { localDateInTimeZone } from "@neobuni/core";
import { getClient, getGoal, getStudyGoalConfig, runRepo } from "@neobuni/db";

import { previewStudyScout } from "../src/study/scout-worker";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
if (databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required (e.g. file:../../.data/local.db).");
}

const newestStudyGoalId = async (): Promise<string | null> => {
  const result = await getClient().execute(`
    SELECT goals.id FROM goals
    INNER JOIN study_goal_configs ON study_goal_configs.goal_id = goals.id
    ORDER BY goals.updated_at DESC
    LIMIT 1
  `);
  const id = result.rows[0]?.id;
  return typeof id === "string" ? id : null;
};

const resolveGoal = async () => {
  const goalId = process.env.GOAL_ID?.trim() ?? (await newestStudyGoalId());
  if (!goalId) {
    throw new Error("No goal with a study configuration was found.");
  }

  const [goal, config] = await Promise.all([
    runRepo(getGoal(goalId)),
    runRepo(getStudyGoalConfig(goalId)),
  ]);
  if (!(goal && config)) {
    throw new Error(`Goal ${goalId} has no study configuration.`);
  }
  return { config, goal };
};

const { config, goal } = await resolveGoal();
const startedAt = Date.now();
const result = await previewStudyScout({
  goalId: goal.id,
  localDate: localDateInTimeZone(new Date(), config.timezone),
  profileId: goal.profileId,
});

console.log(
  JSON.stringify(
    {
      available: result.available,
      candidateCount: result.candidateCount,
      elapsedMs: Date.now() - startedAt,
      errors: result.errors,
      goalId: goal.id,
      localDate: result.localDate,
      picks: result.picks.map((pick) => ({
        kind: pick.kind,
        title: pick.title,
        url: pick.url,
      })),
      queryCount: result.queryCount,
      reason: result.reason,
    },
    null,
    2
  )
);

if (!(result.available && result.picks.length > 0)) {
  process.exitCode = 1;
}
