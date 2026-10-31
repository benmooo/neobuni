import type {
  StudyGoalConfig,
  StudyScoutCandidate,
  StudyScoutRunResult,
  StudyScoutSettings,
} from "@neobuni/contracts";
import {
  addMinutesToClock,
  localClockInTimeZone,
  localDateInTimeZone,
} from "@neobuni/core";
import {
  appendEvent,
  getLatestStudyPlan,
  getStudyGoalConfig,
  listActiveProfiles,
  listEvents,
  listGoals,
  listStudyMastery,
  listStudySessions,
  runRepo,
} from "@neobuni/db";
import { Effect } from "effect";
import { sendDiscordMessage } from "../integrations/discord";
import { sendFeishuMessage } from "../integrations/feishu";
import { sendQqMessage } from "../integrations/qq";
import { sendTelegramMessage } from "../integrations/telegram";
import { searchDeepSeek } from "../integrations/web/deepseek-search";
import { resolveWebProvider } from "../integrations/web/provider";
import { countNudgesOnDate, type StudyNudgeEvent } from "./nudge-service";
import { resolveStudyReasoningConfig } from "./reasoning-config";
import { readStudyReminderConfig } from "./reminder-worker";
import {
  buildScoutProfile,
  buildScoutQueries,
  collectCandidates,
  filterCandidates,
  rankCandidates,
  type ScoutCandidate,
  type ScoutFeedback,
  type ScoutPick,
} from "./scout-service";

interface StudyScoutConfig {
  enabled: boolean;
  minRerankScore: number;
  perDay: number;
  tickMs: number;
}

interface StudyScoutDeps {
  appendEvent: typeof appendEvent;
  getLatestStudyPlan: typeof getLatestStudyPlan;
  getStudyGoalConfig: typeof getStudyGoalConfig;
  listActiveProfiles: typeof listActiveProfiles;
  listEvents: typeof listEvents;
  listGoals: typeof listGoals;
  listStudyMastery: typeof listStudyMastery;
  listStudySessions: typeof listStudySessions;
  rank?: typeof rankCandidates;
  resolveReasoningConfig: typeof resolveStudyReasoningConfig;
  resolveWebProvider: typeof resolveWebProvider;
  search: typeof searchDeepSeek;
  sendDiscordMessage: typeof sendDiscordMessage;
  sendFeishuMessage: typeof sendFeishuMessage;
  sendQqMessage: typeof sendQqMessage;
  sendTelegramMessage: typeof sendTelegramMessage;
}

const DEFAULT_CONFIG: StudyScoutConfig = {
  enabled: true,
  minRerankScore: 1.5,
  perDay: 2,
  tickMs: 15 * 60_000,
};

const PRE_WINDOW_MINUTES = 30;
const MAX_DIGEST_ITEMS = 3;
const DIGEST_ID_LENGTH = 8;
const DIGEST_WHY_LIMIT = 40;
const DIGEST_SUMMARY_LIMIT = 120;

const defaultDeps: StudyScoutDeps = {
  appendEvent,
  getLatestStudyPlan,
  getStudyGoalConfig,
  listActiveProfiles,
  listEvents,
  listGoals,
  listStudyMastery,
  listStudySessions,
  resolveReasoningConfig: resolveStudyReasoningConfig,
  resolveWebProvider,
  search: searchDeepSeek,
  sendDiscordMessage,
  sendFeishuMessage,
  sendQqMessage,
  sendTelegramMessage,
};

const toBoolean = (value: string | undefined, fallback: boolean) =>
  value === undefined
    ? fallback
    : ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())
      ? true
      : ["0", "false", "no", "off"].includes(value.trim().toLowerCase())
        ? false
        : fallback;

const toPositiveNumber = (
  value: string | undefined,
  fallback: number,
  min: number
) => {
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(min, parsed) : fallback;
};

const readStudyScoutConfig = (): StudyScoutConfig => ({
  enabled: toBoolean(
    process.env.NEOBUNI_STUDY_SCOUT_ENABLED,
    DEFAULT_CONFIG.enabled
  ),
  minRerankScore: toPositiveNumber(
    process.env.NEOBUNI_STUDY_SCOUT_MIN_RERANK,
    DEFAULT_CONFIG.minRerankScore,
    0
  ),
  perDay: Math.trunc(
    toPositiveNumber(
      process.env.NEOBUNI_STUDY_SCOUT_PER_DAY,
      DEFAULT_CONFIG.perDay,
      1
    )
  ),
  tickMs: toPositiveNumber(
    process.env.NEOBUNI_STUDY_SCOUT_TICK_MS,
    DEFAULT_CONFIG.tickMs,
    60_000
  ),
});

/**
 * The digest is delivered in the same half-open slot the day-plan nudge uses,
 * so a learner sees "here is today's plan" and "here is today's reading" as one
 * gesture instead of two unrelated pings.
 */
const isWithinScoutWindow = (input: {
  config: StudyGoalConfig;
  localClock: string;
}): boolean => {
  const { start } = input.config.studyWindow;
  const windowStart = addMinutesToClock(start, -PRE_WINDOW_MINUTES);
  return input.localClock >= windowStart && input.localClock < start;
};

const feedbackOf = (events: StudyNudgeEvent[]): ScoutFeedback[] =>
  events
    .filter((event) => event.type === "study.scout_feedback")
    .map((event) => {
      const payload = event.payload ?? {};
      const action = payload.action;
      return {
        action: action === "skip" ? "skip" : "later",
        host: typeof payload.host === "string" ? payload.host : "",
        localDate:
          typeof payload.localDate === "string"
            ? payload.localDate
            : event.createdAt.slice(0, 10),
        topicKey: typeof payload.topicKey === "string" ? payload.topicKey : "",
      } satisfies ScoutFeedback;
    });

const deliveredUrlsOf = (events: StudyNudgeEvent[]): string[] =>
  events
    .filter((event) => event.type === "study.scout_sent")
    .flatMap((event) => {
      const items = event.payload?.items;
      return Array.isArray(items)
        ? items
            .map((item) =>
              typeof (item as { url?: unknown }).url === "string"
                ? ((item as { url: string }).url as string)
                : null
            )
            .filter((url): url is string => url !== null)
        : [];
    });

const sentOnDate = (events: StudyNudgeEvent[], localDate: string): boolean =>
  events.some(
    (event) =>
      event.type === "study.scout_sent" &&
      (event.payload?.localDate === localDate ||
        event.createdAt.slice(0, 10) === localDate)
  );

const dayLabel = (value: string | null): string =>
  value ? value.slice(0, 10) : "无日期";

const kindLabel = (pick: ScoutPick): string =>
  pick.kind === "past-exam" ? "真题" : "文章";

const digestText = (input: {
  localDate: string;
  picks: ScoutPick[];
}): string => {
  const lines = [`📚 今日精选材料 · ${input.picks.length} 条`, ""];

  input.picks.forEach((pick, index) => {
    lines.push(`${index + 1}. ${pick.title}`);
    lines.push(
      `${pick.host} · ${dayLabel(pick.publishedAt)} · ${kindLabel(pick)}`
    );
    lines.push(`为什么值得看：${pick.why.slice(0, DIGEST_WHY_LIMIT)}`);

    const summary = pick.summary ?? pick.snippet;
    if (summary) {
      lines.push(
        summary
          .replaceAll("\n", " ")
          .replaceAll(/\s{2,}/g, " ")
          .trim()
          .slice(0, DIGEST_SUMMARY_LIMIT)
      );
    }
    lines.push("");
  });

  lines.push("收藏会自动进知识库，出题会写进这一节的检查项。");
  return lines.join("\n");
};

const digestIdOf = (): string => {
  const bytes = new Uint8Array(DIGEST_ID_LENGTH / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
};

const scaffoldKeyboard = (input: { digestId: string; picks: ScoutPick[] }) => {
  const rows = [
    input.picks.map((_, index) => ({
      callback_data: `sc:save:${index}:${input.digestId}`,
      text: `收藏 ${index + 1}`,
    })),
    input.picks.map((_, index) => ({
      callback_data: `sc:quiz:${index}:${input.digestId}`,
      text: `出题 ${index + 1}`,
    })),
    input.picks.map((_, index) => ({
      callback_data: `sc:skip:${index}:${input.digestId}`,
      text: `不感兴趣 ${index + 1}`,
    })),
    [{ callback_data: `sc:later:0:${input.digestId}`, text: "明晚再看" }],
  ];

  return { inline_keyboard: rows.filter((row) => row.length > 0) };
};

const deliverDigest = async (input: {
  deps: StudyScoutDeps;
  digestId: string;
  localDate: string;
  picks: ScoutPick[];
  profileId: string;
  studyConfig: StudyGoalConfig;
}): Promise<{ delivered: number; errors: string[] }> => {
  const text = digestText({ localDate: input.localDate, picks: input.picks });
  const replyMarkup = scaffoldKeyboard({
    digestId: input.digestId,
    picks: input.picks,
  });
  const errors: string[] = [];
  let delivered = 0;

  for (const channel of input.studyConfig.channels) {
    try {
      if (channel.platform === "telegram") {
        await input.deps.sendTelegramMessage(input.profileId, {
          message: { text, type: "text" },
          replyMarkup,
          targetAlias: channel.targetAlias ?? undefined,
          targetId: channel.targetId ?? undefined,
        });
      } else if (channel.platform === "discord") {
        await input.deps.sendDiscordMessage(input.profileId, {
          message: { text, type: "text" },
          targetAlias: channel.targetAlias ?? undefined,
          targetId: channel.targetId ?? undefined,
        });
      } else if (channel.platform === "feishu") {
        if (!channel.targetAlias) {
          throw new Error("Feishu digests require a target alias");
        }
        await input.deps.sendFeishuMessage(input.profileId, {
          message: { text, type: "text" },
          targetAlias: channel.targetAlias,
        });
      } else {
        if (!channel.targetAlias) {
          throw new Error("QQ digests require a target alias");
        }
        await input.deps.sendQqMessage(input.profileId, {
          message: { text, type: "text" },
          targetAlias: channel.targetAlias,
        });
      }
      delivered += 1;
    } catch (error) {
      errors.push(
        `${channel.platform}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return { delivered, errors };
};

interface ScoutGoalRunResult {
  candidateCount: number;
  candidates: ScoutCandidate[];
  errors: string[];
  picks: ScoutPick[];
  queryCount: number;
}

interface StudyScoutSweepInput {
  config?: StudyScoutConfig;
  deps?: Partial<StudyScoutDeps>;
  now?: Date;
}

interface StudyScoutSweepResult {
  delivered: number;
  digestCount: number;
  failed: number;
  goalCount: number;
}

const runStudyScoutForGoal = async (input: {
  config: StudyScoutConfig;
  deps: StudyScoutDeps;
  events: StudyNudgeEvent[];
  goalId: string;
  localDate: string;
  profileId: string;
  settings?: Partial<StudyScoutSettings>;
  studyConfig?: StudyGoalConfig;
}): Promise<ScoutGoalRunResult> => {
  const plan = await runRepo(
    input.deps.getLatestStudyPlan({ goalId: input.goalId, status: "active" })
  );

  if (!plan) {
    return emptyRun();
  }

  const provider = await input.deps.resolveWebProvider(input.profileId);

  if (!provider) {
    return {
      ...emptyRun(),
      errors: [
        "缺少搜索服务密钥：请在「记忆理解与路由」里配置 DeepSeek 的 API Key。",
      ],
    };
  }

  const reasoning = await input.deps.resolveReasoningConfig(input.profileId);
  const [sessions, mastery] = await Promise.all([
    runRepo(input.deps.listStudySessions(input.goalId)),
    runRepo(input.deps.listStudyMastery(input.goalId)),
  ]);
  const profile = buildScoutProfile({
    localDate: input.localDate,
    masteryByNode: Object.fromEntries(
      mastery.map((row) => [row.planNodeId, row.score])
    ),
    nodes: plan.nodes,
    sessions,
  });
  const queries = buildScoutQueries({
    allowlist: input.settings?.siteAllowlist,
    localDate: input.localDate,
    profile,
  });
  const errors: string[] = [];
  const results: Array<{ items: never[]; queryId: string }> = [];

  for (const query of queries) {
    try {
      const result = await input.deps.search({
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        count: 6,
        needContent: false,
        oriQuestion: query.topicLabel,
        query: query.text,
      });
      results.push({
        items: result.items as never[],
        queryId: query.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${query.id}: ${message}`);
      await runRepo(
        input.deps.appendEvent(input.profileId, "study.scout_error", {
          goalId: input.goalId,
          message,
          queryId: query.id,
        })
      );
    }
  }

  const candidates = filterCandidates({
    candidates: collectCandidates({ queries, results }),
    deliveredUrls: deliveredUrlsOf(input.events),
    feedback: feedbackOf(input.events),
    localDate: input.localDate,
    minRerankScore:
      input.settings?.minRerankScore ?? input.config.minRerankScore,
  });

  if (candidates.length === 0) {
    return {
      candidateCount: 0,
      candidates,
      errors,
      picks: [],
      queryCount: queries.length,
    };
  }

  const rank = input.deps.rank ?? rankCandidates;
  const picks = reasoning
    ? await rank({
        candidates,
        config: reasoning,
        localDate: input.localDate,
        profile,
      })
    : [];

  return {
    candidateCount: candidates.length,
    candidates,
    errors,
    picks: picks.slice(0, input.settings?.perDay ?? MAX_DIGEST_ITEMS),
    queryCount: queries.length,
  };
};

const emptyRun = (): ScoutGoalRunResult => ({
  candidateCount: 0,
  candidates: [],
  errors: [],
  picks: [],
  queryCount: 0,
});

const toContractCandidate = (pick: ScoutPick): StudyScoutCandidate => ({
  confidence: pick.confidence,
  host: pick.host,
  kind: pick.kind,
  publishedAt: pick.publishedAt,
  summary: pick.summary,
  title: pick.title,
  topicKey: pick.topicKey,
  topicLabel: pick.topicLabel,
  url: pick.url,
  why: pick.why,
});

const previewStudyScout = async (input: {
  deps?: Partial<StudyScoutDeps>;
  goalId: string;
  localDate: string;
  profileId: string;
  settings?: Partial<StudyScoutSettings>;
}): Promise<StudyScoutRunResult> => {
  const deps = { ...defaultDeps, ...input.deps };
  const events = (await runRepo(
    deps.listEvents(input.profileId)
  )) as unknown as StudyNudgeEvent[];
  const result = await runStudyScoutForGoal({
    config: readStudyScoutConfig(),
    deps,
    events,
    goalId: input.goalId,
    localDate: input.localDate,
    profileId: input.profileId,
    settings: input.settings,
    studyConfig: undefined,
  });

  return {
    candidateCount: result.candidateCount,
    errors: result.errors,
    localDate: input.localDate,
    picks: result.picks.map(toContractCandidate),
    queryCount: result.queryCount,
  };
};

const runStudyScoutSweep = async (
  input: StudyScoutSweepInput = {}
): Promise<StudyScoutSweepResult> => {
  const config = input.config ?? readStudyScoutConfig();
  if (!config.enabled) {
    return { delivered: 0, digestCount: 0, failed: 0, goalCount: 0 };
  }

  const deps = { ...defaultDeps, ...input.deps };
  const now = input.now ?? new Date();
  const reminderConfig = readStudyReminderConfig();
  const profiles = await runRepo(deps.listActiveProfiles());
  let goalCount = 0;
  let digestCount = 0;
  let delivered = 0;
  let failed = 0;

  for (const profile of profiles) {
    const goals = await runRepo(deps.listGoals(profile.id, "active"));

    for (const goal of goals) {
      const studyConfig = await runRepo(deps.getStudyGoalConfig(goal.id));

      if (!studyConfig || studyConfig.channels.length === 0) {
        continue;
      }

      if (studyConfig.scout?.enabled === false) {
        continue;
      }

      goalCount += 1;

      if (isQuietHours(studyConfig, now)) {
        continue;
      }

      const localDate = localDateInTimeZone(now, studyConfig.timezone);

      if (
        !isWithinScoutWindow({
          config: studyConfig,
          localClock: localClockInTimeZone(now, studyConfig.timezone),
        })
      ) {
        continue;
      }

      const events = (await runRepo(
        deps.listEvents(profile.id)
      )) as unknown as StudyNudgeEvent[];

      if (sentOnDate(events, localDate)) {
        continue;
      }

      const budget =
        reminderConfig.maxPerDay -
        countNudgesOnDate(events, localDate, studyConfig.timezone);

      if (budget <= 0) {
        continue;
      }

      const { candidates, picks } = await runStudyScoutForGoal({
        config,
        deps,
        events,
        goalId: goal.id,
        localDate,
        profileId: profile.id,
        settings: studyConfig.scout,
        studyConfig,
      });

      if (picks.length === 0) {
        await runRepo(
          deps.appendEvent(profile.id, "study.scout_run", {
            candidates: candidates.length,
            goalId: goal.id,
            localDate,
            picks: 0,
          })
        );
        continue;
      }

      const digestId = digestIdOf();
      const result = await deliverDigest({
        deps,
        digestId,
        localDate,
        picks,
        profileId: profile.id,
        studyConfig,
      });

      digestCount += 1;
      delivered += result.delivered;
      failed += result.errors.length;

      await runRepo(
        deps.appendEvent(
          profile.id,
          result.delivered > 0 ? "study.scout_sent" : "study.scout_error",
          {
            candidates: candidates.length,
            digestId,
            errors: result.errors,
            goalId: goal.id,
            items: picks.map((pick) => ({
              host: pick.host,
              kind: pick.kind,
              title: pick.title,
              topicKey: pick.topicKey,
              url: pick.url,
            })),
            localDate,
            picks: picks.length,
          }
        )
      );
    }
  }

  return { delivered, digestCount, failed, goalCount };
};

const isQuietHours = (config: StudyGoalConfig, instant: Date): boolean => {
  if (!config.quietHours) {
    return false;
  }

  const clock = localClockInTimeZone(instant, config.timezone);
  const { start, end } = config.quietHours;

  return start <= end
    ? clock >= start && clock < end
    : clock >= start || clock < end;
};

const startStudyScoutWorker = Effect.fnUntraced(function* () {
  const config = readStudyScoutConfig();

  if (!config.enabled) {
    yield* Effect.logInfo(
      "[buni/study-scout] disabled via NEOBUNI_STUDY_SCOUT_ENABLED"
    );
    return;
  }

  yield* Effect.logInfo(
    `[buni/study-scout] started tickMs=${config.tickMs} perDay=${config.perDay}`
  );

  yield* Effect.forever(
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () => runStudyScoutSweep({ config }),
        catch: (cause) => cause,
      }).pipe(
        Effect.catch((error) =>
          Effect.logError("[buni/study-scout] sweep failed", error)
        ),
        Effect.catchDefect((defect) =>
          Effect.logError("[buni/study-scout] sweep defect", defect)
        )
      );
      yield* Effect.sleep(config.tickMs);
    })
  );
});

export type {
  ScoutGoalRunResult,
  StudyScoutConfig,
  StudyScoutDeps,
  StudyScoutSweepInput,
  StudyScoutSweepResult,
};
export {
  digestText,
  isWithinScoutWindow,
  previewStudyScout,
  readStudyScoutConfig,
  runStudyScoutForGoal,
  runStudyScoutSweep,
  startStudyScoutWorker,
};
