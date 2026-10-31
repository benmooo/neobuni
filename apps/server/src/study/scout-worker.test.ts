import type { StudyGoalConfig } from "@neobuni/contracts";
import { Effect } from "effect";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ScoutPick } from "./scout-service";
import {
  digestText,
  isWithinScoutWindow,
  runStudyScoutSweep,
  type StudyScoutConfig,
  type StudyScoutDeps,
} from "./scout-worker";

const originalEnv = {
  enabled: process.env.NEOBUNI_STUDY_SCOUT_ENABLED,
  minRerank: process.env.NEOBUNI_STUDY_SCOUT_MIN_RERANK,
  perDay: process.env.NEOBUNI_STUDY_SCOUT_PER_DAY,
  tickMs: process.env.NEOBUNI_STUDY_SCOUT_TICK_MS,
};

afterEach(() => {
  process.env.NEOBUNI_STUDY_SCOUT_ENABLED = originalEnv.enabled;
  process.env.NEOBUNI_STUDY_SCOUT_MIN_RERANK = originalEnv.minRerank;
  process.env.NEOBUNI_STUDY_SCOUT_PER_DAY = originalEnv.perDay;
  process.env.NEOBUNI_STUDY_SCOUT_TICK_MS = originalEnv.tickMs;
});

const studyConfig: StudyGoalConfig = {
  channels: [{ platform: "telegram", targetAlias: "me", targetId: null }],
  dailyMinutes: 90,
  planStyle: {
    maxLessonMinutes: 45,
    minLessonMinutes: 20,
    reviewRatio: 0.35,
  },
  quietHours: null,
  restDays: [0],
  studyWindow: { end: "22:30", start: "20:00" },
  syllabusTemplateId: "system-architect-2026",
  targetAt: "2027-05-23T00:00:00.000Z",
  timezone: "Asia/Shanghai",
};

const config: StudyScoutConfig = {
  enabled: true,
  minRerankScore: 1.5,
  perDay: 2,
  tickMs: 60_000,
};

const node = {
  checkSpecs: [],
  estimatedMinutes: 40,
  howText: null,
  id: "lesson-1",
  kind: "lesson" as const,
  objective: "理解质量属性",
  order: 0,
  paper: "case" as const,
  parentId: "module-1",
  planId: "plan-1",
  prerequisites: [],
  resources: [],
  syllabusRefs: ["KP-3.2"],
  title: "质量属性战术",
  weight: 1,
  whatText: null,
};

const session = {
  actualMinutes: null,
  completedAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  durationMinutes: 40,
  goalId: "goal-1",
  id: "session-1",
  notes: null,
  planNodeId: "lesson-1",
  profileId: "profile-1",
  rescheduledFrom: null,
  scheduledFor: "2026-10-26T20:30",
  startedAt: null,
  status: "planned" as const,
  timezone: "Asia/Shanghai",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const pick: ScoutPick = {
  authority: 3,
  confidence: 0.82,
  host: "example.com",
  kind: "article",
  publishedAt: "2026-09-01",
  rerankScore: 2.4,
  snippet: null,
  summary: "质量属性战术的落地经验。",
  title: "质量属性战术实践",
  topicKey: "lesson-1",
  topicLabel: "质量属性战术",
  url: "https://example.com/post",
  why: "对应你正在学的质量属性战术",
};

const buildDeps = (
  input: {
    events?: unknown[];
    rankResult?: ScoutPick[];
    studyConfig?: StudyGoalConfig | null;
    provider?: { apiKey: string; baseUrl: string; kind: "deepseek" } | null;
  } = {}
) => {
  const appendEvent = vi.fn(() => Effect.succeed(null));
  const sendTelegramMessage = vi.fn(async () => ({ messageId: "1" }));
  const search = vi.fn(async () => ({
    items: [
      {
        authority: 3,
        publishedAt: "2026-09-01",
        rank: 1,
        rerankScore: 2.4,
        snippet: null,
        sourceName: null,
        summary: "摘要",
        title: "质量属性战术实践",
        url: "https://example.com/post",
      },
    ],
    provider: "deepseek" as const,
    query: "q",
  }));
  const rank = vi.fn(async () => input.rankResult ?? [pick]);

  const deps = {
    appendEvent,
    getLatestStudyPlan: () =>
      Effect.succeed({ nodes: [node], plan: { id: "plan-1" } }),
    getStudyGoalConfig: () =>
      Effect.succeed(
        input.studyConfig === undefined ? studyConfig : input.studyConfig
      ),
    listActiveProfiles: () => Effect.succeed([{ id: "profile-1" }]),
    listEvents: () => Effect.succeed(input.events ?? []),
    listGoals: () => Effect.succeed([{ id: "goal-1" }]),
    listStudySessions: () => Effect.succeed([session]),
    rank,
    resolveReasoningConfig: async () => ({
      apiKey: "sk_test",
      model: "deepseek-chat",
    }),
    resolveWebProvider: async () =>
      input.provider === undefined
        ? {
            apiKey: "sk_test",
            baseUrl: "https://api.deepseek.com",
            kind: "deepseek" as const,
          }
        : input.provider,
    search,
    sendDiscordMessage: vi.fn(async () => ({})),
    sendFeishuMessage: vi.fn(async () => ({})),
    sendQqMessage: vi.fn(async () => ({})),
    sendTelegramMessage,
  } as unknown as StudyScoutDeps & {
    appendEvent: ReturnType<typeof vi.fn>;
    rank: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
    sendTelegramMessage: ReturnType<typeof vi.fn>;
  };

  return deps;
};

const now = new Date("2026-10-26T11:45:00.000Z");

describe("isWithinScoutWindow", () => {
  test("is half-open on the study window start", () => {
    expect(
      isWithinScoutWindow({ config: studyConfig, localClock: "19:29" })
    ).toBe(false);
    expect(
      isWithinScoutWindow({ config: studyConfig, localClock: "19:30" })
    ).toBe(true);
    expect(
      isWithinScoutWindow({ config: studyConfig, localClock: "19:59" })
    ).toBe(true);
    expect(
      isWithinScoutWindow({ config: studyConfig, localClock: "20:00" })
    ).toBe(false);
  });
});

describe("digestText", () => {
  test("lists each pick with host, date, kind and reason", () => {
    const text = digestText({ localDate: "2026-10-26", picks: [pick] });

    expect(text).toContain("📚 今日精选材料 · 1 条");
    expect(text).toContain("1. 质量属性战术实践");
    expect(text).toContain("example.com · 2026-09-01 · 文章");
    expect(text).toContain("为什么值得看：对应你正在学的质量属性战术");
  });
});

describe("runStudyScoutSweep", () => {
  test("delivers a digest with actionable buttons inside the window", async () => {
    const deps = buildDeps();
    const result = await runStudyScoutSweep({ config, deps, now });

    expect(result).toMatchObject({ delivered: 1, digestCount: 1, failed: 0 });
    expect(deps.search).toHaveBeenCalled();
    expect(deps.rank).toHaveBeenCalledOnce();

    const sent = deps.sendTelegramMessage.mock.calls[0]?.[1] as {
      message: { text: string };
      replyMarkup: { inline_keyboard: Array<Array<{ callback_data: string }>> };
    };

    expect(sent.message.text).toContain("今日精选材料");
    const buttons = sent.replyMarkup.inline_keyboard.flat();
    expect(buttons.map((button) => button.callback_data)).toEqual([
      expect.stringMatching(/^sc:save:0:[0-9a-f]+$/),
      expect.stringMatching(/^sc:quiz:0:[0-9a-f]+$/),
      expect.stringMatching(/^sc:skip:0:[0-9a-f]+$/),
      expect.stringMatching(/^sc:later:0:[0-9a-f]+$/),
    ]);
    expect(buttons.every((button) => button.callback_data.length <= 64)).toBe(
      true
    );

    const sentEvent = deps.appendEvent.mock.calls.find(
      (call) => call[1] === "study.scout_sent"
    );
    expect(sentEvent?.[2]).toMatchObject({ localDate: "2026-10-26", picks: 1 });
  });

  test("stays quiet outside the pre-window slot", async () => {
    const deps = buildDeps();
    const result = await runStudyScoutSweep({
      config,
      deps,
      now: new Date("2026-10-26T12:00:00.000Z"),
    });

    expect(result.digestCount).toBe(0);
    expect(deps.sendTelegramMessage).not.toHaveBeenCalled();
  });

  test("yields the budget to nudges that already went out today", async () => {
    const deps = buildDeps({
      events: Array.from({ length: 3 }, (_, index) => ({
        createdAt: "2026-10-26T11:00:00.000Z",
        payload: { dedupeKey: `session_due:${index}` },
        type: "study.nudge_sent",
      })),
    });
    const result = await runStudyScoutSweep({ config, deps, now });

    expect(result.digestCount).toBe(0);
    expect(deps.sendTelegramMessage).not.toHaveBeenCalled();
  });

  test("respects quiet hours", async () => {
    const deps = buildDeps({
      studyConfig: {
        ...studyConfig,
        quietHours: { end: "20:00", start: "19:00" },
      },
    });
    const result = await runStudyScoutSweep({ config, deps, now });

    expect(result.digestCount).toBe(0);
  });

  test("does not deliver twice on the same local date", async () => {
    const deps = buildDeps({
      events: [
        {
          createdAt: "2026-10-26T11:40:00.000Z",
          payload: { localDate: "2026-10-26" },
          type: "study.scout_sent",
        },
      ],
    });
    const result = await runStudyScoutSweep({ config, deps, now });

    expect(result.digestCount).toBe(0);
  });

  test("stays silent when no search provider is configured", async () => {
    const deps = buildDeps({ provider: null });
    const result = await runStudyScoutSweep({ config, deps, now });

    expect(result.digestCount).toBe(0);
    expect(deps.search).not.toHaveBeenCalled();
    expect(
      deps.appendEvent.mock.calls.some((call) => call[1] === "study.scout_sent")
    ).toBe(false);
  });

  test("records a run without picks instead of sending an empty digest", async () => {
    const deps = buildDeps({ rankResult: [] });
    const result = await runStudyScoutSweep({ config, deps, now });

    expect(result.digestCount).toBe(0);
    expect(deps.sendTelegramMessage).not.toHaveBeenCalled();
    expect(
      deps.appendEvent.mock.calls.some((call) => call[1] === "study.scout_run")
    ).toBe(true);
  });

  test("skips goals without channels", async () => {
    const deps = buildDeps({ studyConfig: { ...studyConfig, channels: [] } });
    const result = await runStudyScoutSweep({ config, deps, now });

    expect(result.goalCount).toBe(0);
  });
});
