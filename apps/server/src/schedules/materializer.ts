import { listActiveProfiles, listDueSchedules } from "@neobuni/db";
import { Effect } from "effect";

import { materializeDueSchedule } from "./materialize";

interface ScheduleMaterializerConfig {
  enabled: boolean;
  limitPerProfile: number;
  tickMs: number;
}

interface ScheduleMaterializerProfileResult {
  completedCount: number;
  dueCount: number;
  failureCount: number;
  materializedCount: number;
  profileId: string;
}

interface ScheduleMaterializerSweepResult {
  profileResults: ScheduleMaterializerProfileResult[];
  startedAt: string;
}

const DEFAULT_SCHEDULE_MATERIALIZER_CONFIG: ScheduleMaterializerConfig = {
  enabled: true,
  tickMs: 30_000,
  limitPerProfile: 20,
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

const readScheduleMaterializerConfig = (): ScheduleMaterializerConfig => ({
  enabled: toBoolean(
    process.env.NEOBUNI_SCHEDULE_MATERIALIZER_ENABLED,
    DEFAULT_SCHEDULE_MATERIALIZER_CONFIG.enabled
  ),
  tickMs: toPositiveInt(
    process.env.NEOBUNI_SCHEDULE_MATERIALIZER_TICK_MS,
    DEFAULT_SCHEDULE_MATERIALIZER_CONFIG.tickMs,
    1000
  ),
  limitPerProfile: toPositiveInt(
    process.env.NEOBUNI_SCHEDULE_MATERIALIZER_LIMIT_PER_PROFILE,
    DEFAULT_SCHEDULE_MATERIALIZER_CONFIG.limitPerProfile,
    1
  ),
});

const runScheduleMaterializerSweep = Effect.fnUntraced(function* (input?: {
  nowIso?: string;
  config?: ScheduleMaterializerConfig;
  profileIds?: string[];
}) {
  const config = input?.config ?? readScheduleMaterializerConfig();
  const startedAt = input?.nowIso ?? new Date().toISOString();
  const profiles = (yield* listActiveProfiles()).filter(
    (profile) =>
      input?.profileIds === undefined || input.profileIds.includes(profile.id)
  );
  const profileResults: ScheduleMaterializerProfileResult[] = [];

  for (const profile of profiles) {
    const dueSchedules = yield* listDueSchedules(profile.id, {
      nowIso: startedAt,
      limit: config.limitPerProfile,
    });
    let materializedCount = 0;
    let completedCount = 0;
    let failureCount = 0;

    for (const schedule of dueSchedules) {
      const result = yield* materializeDueSchedule({
        nowIso: startedAt,
        schedule,
      }).pipe(
        Effect.catch((error) =>
          Effect.logWarning(
            `[buni/schedule-materializer] schedule=${schedule.id} materialization failed`,
            error
          ).pipe(Effect.as(null))
        ),
        Effect.catchDefect((defect) =>
          Effect.logWarning(
            `[buni/schedule-materializer] schedule=${schedule.id} materialization crashed`,
            defect
          ).pipe(Effect.as(null))
        )
      );

      if (result === null) {
        failureCount += 1;
        continue;
      }

      if (result.materialized) {
        materializedCount += 1;
      }

      if (result.completed) {
        completedCount += 1;
      }
    }

    profileResults.push({
      profileId: profile.id,
      dueCount: dueSchedules.length,
      materializedCount,
      completedCount,
      failureCount,
    });
  }

  return {
    startedAt,
    profileResults,
  };
});

const logSweepResult = (result: ScheduleMaterializerSweepResult) => {
  const dueCount = result.profileResults.reduce(
    (sum, profile) => sum + profile.dueCount,
    0
  );
  const materializedCount = result.profileResults.reduce(
    (sum, profile) => sum + profile.materializedCount,
    0
  );
  const failureCount = result.profileResults.reduce(
    (sum, profile) => sum + profile.failureCount,
    0
  );

  if (dueCount === 0 && materializedCount === 0 && failureCount === 0) {
    return Effect.void;
  }

  return Effect.logInfo(
    `[buni/schedule-materializer] sweep: profiles=${result.profileResults.length} due=${dueCount} materialized=${materializedCount} failures=${failureCount}`
  );
};

const startScheduleMaterializer = Effect.fn("startScheduleMaterializer")(
  function* () {
    const config = readScheduleMaterializerConfig();

    if (!config.enabled) {
      yield* Effect.logInfo("schedule materializer disabled");
      return;
    }

    const tick = runScheduleMaterializerSweep({ config }).pipe(
      Effect.andThen((result) => logSweepResult(result)),
      Effect.catch((error) =>
        Effect.logWarning("[buni/schedule-materializer] tick failed", error)
      ),
      Effect.catchDefect((defect) =>
        Effect.logWarning("[buni/schedule-materializer] tick crashed", defect)
      )
    );

    yield* Effect.logInfo(
      `[buni/schedule-materializer] started tickMs=${config.tickMs} limitPerProfile=${config.limitPerProfile}`
    );

    yield* Effect.forever(
      tick.pipe(Effect.andThen(Effect.sleep(config.tickMs)))
    );
  }
);

export type {
  ScheduleMaterializerConfig,
  ScheduleMaterializerProfileResult,
  ScheduleMaterializerSweepResult,
};
export {
  readScheduleMaterializerConfig,
  runScheduleMaterializerSweep,
  startScheduleMaterializer,
};
