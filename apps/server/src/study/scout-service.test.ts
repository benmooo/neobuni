import type { StudyPlanNode, StudySession } from "@neobuni/contracts";
import { describe, expect, test } from "vitest";

import {
  buildScoutProfile,
  buildScoutQueries,
  filterCandidates,
  heuristicPicks,
  normalizeUrl,
  rankCandidates,
  type ScoutCandidate,
  suppressionUntil,
} from "./scout-service";

const lesson = (id: string, title: string, syllabusRefs: string[] = []) =>
  ({
    id,
    kind: "lesson",
    title,
    syllabusRefs,
    estimatedMinutes: 40,
    order: 0,
    paper: "case",
    planId: "plan-1",
    parentId: "module-1",
    objective: null,
    whatText: null,
    howText: null,
    checkSpecs: [],
    prerequisites: [],
    resources: [],
    weight: 1,
  }) as unknown as StudyPlanNode;

const session = (input: Partial<StudySession> & { planNodeId: string }) =>
  ({
    actualMinutes: null,
    completedAt: null,
    durationMinutes: 40,
    goalId: "goal-1",
    id: `session-${input.planNodeId}-${input.scheduledFor ?? "x"}`,
    notes: null,
    profileId: "profile-1",
    rescheduledFrom: null,
    scheduledFor: "2026-10-26T20:30",
    startedAt: null,
    status: "planned",
    timezone: "Asia/Shanghai",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...input,
  }) as unknown as StudySession;

const candidate = (
  overrides: Partial<ScoutCandidate> = {}
): ScoutCandidate => ({
  authority: 3,
  host: "example.com",
  kind: "article",
  publishedAt: null,
  rerankScore: 2.4,
  snippet: null,
  summary: null,
  title: "t",
  topicKey: "lesson-1",
  topicLabel: "质量属性",
  url: "https://example.com/a",
  ...overrides,
});

describe("buildScoutProfile", () => {
  test("ranks weak, upcoming and recent lessons above untouched ones", () => {
    const profile = buildScoutProfile({
      localDate: "2026-10-26",
      masteryByNode: { "lesson-1": 0.3, "lesson-2": 0.9 },
      nodes: [
        lesson("lesson-1", "质量属性战术"),
        lesson("lesson-2", "架构风格"),
        lesson("lesson-3", "设计模式"),
      ],
      sessions: [
        session({
          planNodeId: "lesson-2",
          status: "completed",
          completedAt: "2026-10-20T12:30:00.000Z",
        }),
        session({
          planNodeId: "lesson-3",
          scheduledFor: "2026-10-27T20:30",
        }),
      ],
    });

    expect(profile.topics.map((topic) => [topic.key, topic.tag])).toEqual([
      ["lesson-1", "weak"],
      ["lesson-3", "upcoming"],
      ["lesson-2", "recent"],
    ]);
    expect(profile.topics[0]?.weight).toBeGreaterThan(
      profile.topics[2]?.weight ?? 0
    );
  });

  test("keeps syllabus refs as extra keywords and dedupes them", () => {
    const profile = buildScoutProfile({
      localDate: "2026-10-26",
      nodes: [lesson("lesson-1", "质量属性", ["KP-3.2", "kp-3.2"])],
      sessions: [],
    });

    expect(profile.topics[0]?.keywords).toEqual(["质量属性", "KP-3.2"]);
  });

  test("ignores module nodes and sessions outside the windows", () => {
    const profile = buildScoutProfile({
      localDate: "2026-10-26",
      nodes: [
        lesson("lesson-1", "质量属性"),
        { ...lesson("module-1", "模块"), kind: "module" } as StudyPlanNode,
      ],
      sessions: [
        session({
          planNodeId: "lesson-1",
          status: "completed",
          completedAt: "2026-09-01T12:30:00.000Z",
        }),
      ],
    });

    expect(profile.topics).toHaveLength(1);
    expect(profile.topics[0]?.tag).toBe("goal");
  });
});

describe("buildScoutQueries", () => {
  test("builds operator-rich queries and keeps the exclusion suffixes", () => {
    const profile = buildScoutProfile({
      localDate: "2026-10-26",
      nodes: [lesson("lesson-1", "质量属性")],
      sessions: [],
    });
    const queries = buildScoutQueries({
      localDate: "2026-10-26",
      profile,
    });

    expect(queries).toHaveLength(4);
    expect(queries[0]?.text).toBe(
      "质量属性 深度分析 after:2024-10-26 -site:facebook.com -site:pinterest.com -site:x.com"
    );
    expect(queries[1]?.text).toBe(
      "site:ruankao.org.cn 质量属性 真题 -site:facebook.com -site:pinterest.com -site:x.com"
    );
    expect(queries.map((query) => query.kind)).toEqual([
      "article",
      "past-exam",
      "past-exam",
      "article",
    ]);
  });

  test("respects the configured allowlist and query limit", () => {
    const profile = buildScoutProfile({
      localDate: "2026-10-26",
      nodes: [lesson("lesson-1", "质量属性"), lesson("lesson-2", "架构风格")],
      sessions: [],
    });

    const queries = buildScoutQueries({
      allowlist: ["ruankao.org.cn"],
      localDate: "2026-10-26",
      maxQueries: 2,
      profile,
    });

    expect(queries).toHaveLength(2);
    expect(queries[1]?.text).toContain("site:ruankao.org.cn");
  });

  test("returns nothing without topics", () => {
    expect(
      buildScoutQueries({ localDate: "2026-10-26", profile: { topics: [] } })
    ).toEqual([]);
  });
});

describe("normalizeUrl", () => {
  test("strips tracking params, fragments and trailing slashes", () => {
    expect(normalizeUrl("http://Example.com/post/?utm_source=x&id=3#top")).toBe(
      "https://example.com/post?id=3"
    );
  });

  test("rejects non-http urls", () => {
    expect(normalizeUrl("ftp://example.com/a")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });
});

describe("filterCandidates", () => {
  const base = { localDate: "2026-10-26" };

  test("drops low rerank scores but keeps a top-5 relaxation", () => {
    const kept = filterCandidates({
      ...base,
      candidates: [
        candidate({ url: "https://a.example.com/1", rerankScore: 1.9 }),
        candidate({ url: "https://b.example.com/2", rerankScore: 1.2 }),
        candidate({ url: "https://c.example.com/3", rerankScore: 0.4 }),
      ],
    });

    expect(kept.map((entry) => entry.host)).toEqual([
      "a.example.com",
      "b.example.com",
    ]);
  });

  test("drops unknown-authority items below the stricter rerank bar", () => {
    const kept = filterCandidates({
      ...base,
      candidates: [
        candidate({
          authority: -1,
          publishedAt: "2026-09-01",
          rerankScore: 1.8,
          url: "https://a.example.com/1",
        }),
        candidate({
          authority: -1,
          publishedAt: "2026-09-01",
          rerankScore: 2.6,
          url: "https://b.example.com/2",
        }),
      ],
    });

    expect(kept.map((entry) => entry.host)).toEqual(["b.example.com"]);
  });

  test("enforces recency windows per kind", () => {
    const kept = filterCandidates({
      ...base,
      candidates: [
        candidate({
          kind: "article",
          publishedAt: "2024-01-01",
          url: "https://a.example.com/old-article",
        }),
        candidate({
          kind: "past-exam",
          publishedAt: "2024-01-01",
          url: "https://b.example.com/old-exam",
        }),
        candidate({
          authority: 2,
          publishedAt: null,
          url: "https://c.example.com/undated",
        }),
      ],
    });

    expect(kept.map((entry) => entry.host)).toEqual(["b.example.com"]);
  });

  test("dedupes already delivered urls across tracking variants", () => {
    const kept = filterCandidates({
      ...base,
      candidates: [
        candidate({ url: "https://a.example.com/post?utm_medium=x" }),
      ],
      deliveredUrls: ["https://a.example.com/post"],
    });

    expect(kept).toEqual([]);
  });

  test("suppresses skipped host/topic pairs for 30 days and later ones for 7", () => {
    const feedback = [
      {
        action: "skip" as const,
        host: "a.example.com",
        localDate: "2026-10-20",
        topicKey: "lesson-1",
      },
      {
        action: "later" as const,
        host: "b.example.com",
        localDate: "2026-10-20",
        topicKey: "lesson-1",
      },
    ];

    expect(suppressionUntil(feedback[0]!)).toBe(
      `2026-11-${19}` // 30 days after 10-20
    );

    const kept = filterCandidates({
      ...base,
      candidates: [
        candidate({ url: "https://a.example.com/1" }),
        candidate({ url: "https://b.example.com/2" }),
      ],
      feedback,
      localDate: "2026-10-28",
    });

    expect(kept.map((entry) => entry.host)).toEqual(["b.example.com"]);
  });

  test("caps one candidate per host and eight per digest", () => {
    const candidates = [
      candidate({ url: "https://a.example.com/1" }),
      candidate({ url: "https://a.example.com/2" }),
      ...Array.from({ length: 10 }, (_, index) =>
        candidate({ url: `https://h${index}.example.com/p` })
      ),
    ];

    const kept = filterCandidates({ ...base, candidates });

    expect(kept).toHaveLength(8);
    expect(kept.filter((entry) => entry.host === "a.example.com")).toHaveLength(
      1
    );
  });

  test("excludes the configured junk hosts", () => {
    const kept = filterCandidates({
      ...base,
      candidates: [
        candidate({ url: "https://facebook.com/post" }),
        candidate({ url: "https://m.x.com/post" }),
      ],
    });

    expect(kept).toEqual([]);
  });
});

describe("heuristicPicks", () => {
  test("orders by rerank, authority and recency and keeps at most three", () => {
    const picks = heuristicPicks(
      [
        candidate({
          host: "a",
          url: "https://a/1",
          rerankScore: 3,
          authority: 4,
        }),
        candidate({
          host: "b",
          url: "https://b/2",
          rerankScore: 1.6,
          authority: 2,
        }),
        candidate({
          host: "c",
          url: "https://c/3",
          rerankScore: 2.2,
          authority: 3,
        }),
        candidate({
          host: "d",
          url: "https://d/4",
          rerankScore: 0.2,
          authority: 0,
        }),
      ],
      "2026-10-26"
    );

    // "b" scores 0.49, below the confidence floor, so it is dropped.
    expect(picks.map((pick) => pick.host)).toEqual(["a", "c"]);
    expect(picks[0]?.confidence).toBeLessThanOrEqual(1);
  });
});

describe("rankCandidates", () => {
  const config = { apiKey: "sk_test", model: "deepseek-chat" };
  const profile = buildScoutProfile({
    localDate: "2026-10-26",
    nodes: [lesson("lesson-1", "质量属性")],
    sessions: [],
  });

  test("keeps confident picks and clamps the reason length", async () => {
    const picks = await rankCandidates({
      candidates: [
        candidate({ host: "a", url: "https://a/1" }),
        candidate({ host: "b", url: "https://b/2" }),
      ],
      config,
      deps: {
        createChatCompletion: async () =>
          JSON.stringify({
            picks: [
              { index: 1, why: "x".repeat(120), confidence: 0.9 },
              { index: 0, confidence: 0.2 },
              { index: 7, confidence: 0.9 },
            ],
          }),
      },
      localDate: "2026-10-26",
      profile,
    });

    expect(picks).toHaveLength(1);
    expect(picks[0]?.host).toBe("b");
    expect(picks[0]?.why).toHaveLength(60);
    expect(picks[0]?.confidence).toBe(0.9);
  });

  test("falls back to the heuristic ranking on malformed output", async () => {
    const picks = await rankCandidates({
      candidates: [candidate({ host: "a", url: "https://a/1" })],
      config,
      deps: { createChatCompletion: async () => "sorry, I cannot help" },
      localDate: "2026-10-26",
      profile,
    });

    expect(picks.map((pick) => pick.host)).toEqual(["a"]);
  });

  test("falls back when the model call throws", async () => {
    const picks = await rankCandidates({
      candidates: [candidate({ host: "a", url: "https://a/1" })],
      config,
      deps: {
        createChatCompletion: async () => {
          throw new Error("upstream down");
        },
      },
      localDate: "2026-10-26",
      profile,
    });

    expect(picks.map((pick) => pick.host)).toEqual(["a"]);
  });

  test("returns an empty list when there is nothing to rank", async () => {
    expect(
      await rankCandidates({
        candidates: [],
        config,
        localDate: "2026-10-26",
        profile,
      })
    ).toEqual([]);
  });
});
