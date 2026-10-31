import { studyLessonEnrichmentSchema } from "@neobuni/contracts";
import { Effect } from "effect";
import { describe, expect, test, vi } from "vitest";
import type { StudyNudgeEvent } from "./nudge-service";
import {
  applyStudyScoutAction,
  parseScoutCallback,
  type ScoutActionDeps,
  scoutCallbackData,
} from "./scout-actions";

const DIGEST_ID = "ab12cd34";

const baseSpec = (index: number) => ({
  answerKey: null,
  id: `base-${index}`,
  kind: "recall" as const,
  prompt: `基础题 ${index}`,
  rubric: "要点齐全",
});

const enrichment = () => ({
  checkSpecs: [baseSpec(1), baseSpec(2), baseSpec(3)],
  enrichedAt: "2026-05-01T00:00:00.000Z",
  howText: "先读再画",
  material: null,
  objective: "掌握质量属性",
  resources: [],
  source: "llm" as const,
  whatText: "质量属性场景",
});

const node = (overrides: Record<string, unknown> = {}) => ({
  checkSpecs: [baseSpec(1), baseSpec(2), baseSpec(3)],
  completed: false,
  conceptIds: [],
  desiredOutcome: null,
  enrichment: enrichment(),
  estimatedMinutes: 40,
  howText: "先读再画",
  id: "node-1",
  kind: "lesson",
  mastery: 0.3,
  objective: "掌握质量属性",
  paper: "case",
  resources: [],
  syllabusRefs: ["质量属性"],
  title: "质量属性场景",
  topicId: "topic-1",
  whatText: "质量属性场景",
  ...overrides,
});

const digestEvent = (
  overrides: Record<string, unknown> = {}
): StudyNudgeEvent => ({
  createdAt: "2026-05-20T00:30:00.000Z",
  payload: {
    digestId: DIGEST_ID,
    goalId: "goal-1",
    items: [
      {
        host: "zhihu.com",
        kind: "article",
        title: "质量属性场景实战",
        topicKey: "node-1",
        url: "https://zhihu.com/p/1",
      },
      {
        host: "ruankao.org.cn",
        kind: "past-exam",
        tintle: null,
        topicKey: "node-1",
        url: "https://ruankao.org.cn/p/2",
      },
    ],
    localDate: "2026-05-20",
    ...overrides,
  },
  type: "study.scout_sent",
});

const quizPayload = JSON.stringify({
  checks: [
    { answerKey: null, kind: "case", prompt: "延伸题一", rubric: "要点" },
    { answerKey: null, kind: "case", prompt: "延伸题二", rubric: "要点" },
    { answerKey: "答", kind: "recall", prompt: "延伸题三", rubric: "要点" },
  ],
});

const makeDeps = (input?: {
  events?: StudyNudgeEvent[];
  nodes?: ReturnType<typeof node>[];
  provider?: { apiKey: string; baseUrl: string; kind: string } | null;
}) => {
  const appendEvent = vi.fn(() => Effect.succeed(null));
  const deps = {
    appendEvent,
    createChatCompletion: vi.fn(async () => quizPayload),
    fetchPage: vi.fn(async () => ({
      document: {
        finalUrl: "https://zhihu.com/p/1",
        markdown: "文章正文",
        plainText: "文章正文",
        title: "质量属性场景实战",
      },
      provider: "deepseek",
    })),
    getLatestStudyPlan: vi.fn(() =>
      Effect.succeed({
        nodes: input?.nodes ?? [node()],
        plan: { id: "plan-1" },
      })
    ),
    listEvents: vi.fn(() => Effect.succeed(input?.events ?? [digestEvent()])),
    resolveReasoning: vi.fn(async () => ({
      apiKey: "sk-reasoning",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      temperature: 0.2,
    })),
    resolveWebProvider: vi.fn(async () =>
      input?.provider === undefined
        ? {
            apiKey: "sk-test",
            baseUrl: "https://api.deepseek.com",
            kind: "deepseek",
          }
        : input.provider
    ),
    saveWebPageToKnowledge: vi.fn(async () => ({ documentId: "doc-1" })),
    updateStudyNodeEnrichment: vi.fn(() =>
      Effect.succeed(node({ enrichment: enrichment() }))
    ),
  } as unknown as ScoutActionDeps;

  return { appendEvent, deps };
};

describe("parseScoutCallback", () => {
  test("parses a scout button payload", () => {
    expect(parseScoutCallback("sc:quiz:2:ab12cd34")).toEqual({
      action: "quiz",
      digestId: "ab12cd34",
      index: 2,
    });
  });

  test("rejects malformed payloads", () => {
    expect(parseScoutCallback("st:save:0:ab12cd34")).toBeNull();
    expect(parseScoutCallback("sc:save:0:")).toBeNull();
    expect(parseScoutCallback("sc:nope:0:ab12cd34")).toBeNull();
    expect(parseScoutCallback("sc:save:40:ab12cd34")).toBeNull();
    expect(parseScoutCallback("sc:save:x:ab12cd34")).toBeNull();
    expect(parseScoutCallback("sc:save:0:zz")).toBeNull();
  });

  test("keeps callback data under the telegram limit", () => {
    expect(
      Buffer.byteLength(
        scoutCallbackData({ action: "later", digestId: DIGEST_ID, index: 0 })
      )
    ).toBeLessThanOrEqual(64);
  });
});

describe("applyStudyScoutAction", () => {
  test("degrades gracefully when the digest is unknown", async () => {
    const { appendEvent, deps } = makeDeps({ events: [] });

    const result = await applyStudyScoutAction(
      { action: "save", digestId: DIGEST_ID, index: 0, profileId: "profile-1" },
      deps
    );

    expect(result?.stale).toBe(true);
    expect(result?.ack).toContain("过期");
    expect(appendEvent).not.toHaveBeenCalled();
  });

  test("degrades gracefully when the index is missing", async () => {
    const { deps } = makeDeps();

    const result = await applyStudyScoutAction(
      { action: "save", digestId: DIGEST_ID, index: 5, profileId: "profile-1" },
      deps
    );

    expect(result?.stale).toBe(true);
  });

  test("saves the page into the knowledge base", async () => {
    const { appendEvent, deps } = makeDeps();

    const result = await applyStudyScoutAction(
      { action: "save", digestId: DIGEST_ID, index: 0, profileId: "profile-1" },
      deps
    );

    expect(deps.fetchPage).toHaveBeenCalledWith({
      provider: {
        apiKey: "sk-test",
        baseUrl: "https://api.deepseek.com",
        kind: "deepseek",
      },
      url: "https://zhihu.com/p/1",
    });
    expect(deps.saveWebPageToKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "profile-1",
        trustLevel: "imported",
        url: "https://zhihu.com/p/1",
      })
    );
    expect(appendEvent).toHaveBeenCalledWith(
      "profile-1",
      "study.scout_saved",
      expect.objectContaining({
        digestId: DIGEST_ID,
        documentId: "doc-1",
        goalId: "goal-1",
        lessonTitle: "质量属性场景",
        planNodeId: "node-1",
        url: "https://zhihu.com/p/1",
      })
    );
    expect(result?.ack).toBe("已收藏到「质量属性场景」的资料里。");
    expect(deps.updateStudyNodeEnrichment).toHaveBeenCalledWith({
      enrichment: expect.objectContaining({
        checkSpecs: expect.any(Array),
        resources: ["https://zhihu.com/p/1"],
      }),
      planNodeId: "node-1",
    });
  });

  test("attaches the material to a lesson that was never enriched", async () => {
    const { deps } = makeDeps({ nodes: [node({ enrichment: null })] });

    const result = await applyStudyScoutAction(
      { action: "save", digestId: DIGEST_ID, index: 0, profileId: "profile-1" },
      deps
    );

    const updated = vi.mocked(deps.updateStudyNodeEnrichment).mock
      .calls[0]?.[0] as {
      enrichment: {
        checkSpecs: unknown[];
        resources: string[];
        source: string;
      };
      planNodeId: string;
    };

    expect(updated.planNodeId).toBe("node-1");
    expect(updated.enrichment.resources).toEqual(["https://zhihu.com/p/1"]);
    expect(updated.enrichment.checkSpecs).toHaveLength(3);
    expect(updated.enrichment.source).toBe("llm");
    expect(
      studyLessonEnrichmentSchema.safeParse(updated.enrichment).success
    ).toBe(true);
    expect(result?.ack).toBe("已收藏到「质量属性场景」的资料里。");
  });

  test("saves without touching a lesson that has no usable checks", async () => {
    const { appendEvent, deps } = makeDeps({
      nodes: [node({ checkSpecs: [], enrichment: null })],
    });

    const result = await applyStudyScoutAction(
      { action: "save", digestId: DIGEST_ID, index: 0, profileId: "profile-1" },
      deps
    );

    expect(appendEvent).toHaveBeenCalledWith(
      "profile-1",
      "study.scout_saved",
      expect.objectContaining({ planNodeId: "node-1" })
    );
    expect(deps.updateStudyNodeEnrichment).not.toHaveBeenCalled();
    expect(result?.ack).toBe("已收藏到知识库。");
  });

  test("still saves when the lesson has left the plan", async () => {
    const { appendEvent, deps } = makeDeps({ nodes: [] });

    const result = await applyStudyScoutAction(
      { action: "save", digestId: DIGEST_ID, index: 0, profileId: "profile-1" },
      deps
    );

    expect(appendEvent).toHaveBeenCalledWith(
      "profile-1",
      "study.scout_saved",
      expect.objectContaining({ goalId: "goal-1", planNodeId: null })
    );
    expect(result?.ack).toBe("已收藏到知识库。");
    expect(deps.updateStudyNodeEnrichment).not.toHaveBeenCalled();
  });

  test("refuses to save without a search provider", async () => {
    const { deps } = makeDeps({ provider: null });

    const result = await applyStudyScoutAction(
      { action: "save", digestId: DIGEST_ID, index: 0, profileId: "profile-1" },
      deps
    );

    expect(deps.fetchPage).not.toHaveBeenCalled();
    expect(result?.ack).toContain("密钥");
  });

  test("appends three derived checks to the lesson", async () => {
    const { appendEvent, deps } = makeDeps();

    const result = await applyStudyScoutAction(
      { action: "quiz", digestId: DIGEST_ID, index: 0, profileId: "profile-1" },
      deps
    );

    const updated = vi.mocked(deps.updateStudyNodeEnrichment).mock
      .calls[0]?.[0] as {
      enrichment: { checkSpecs: Array<{ prompt: string }> };
      planNodeId: string;
    };

    expect(updated.planNodeId).toBe("node-1");
    expect(updated.enrichment.checkSpecs).toHaveLength(6);
    expect(updated.enrichment.checkSpecs.map((spec) => spec.prompt)).toEqual(
      expect.arrayContaining(["延伸题一", "延伸题二", "延伸题三"])
    );
    expect(appendEvent).toHaveBeenCalledWith(
      "profile-1",
      "study.scout_quiz",
      expect.objectContaining({ planNodeId: "node-1" })
    );
    expect(result?.ack).toContain("互动自检");
  });

  test("does not add duplicate quiz checks", async () => {
    const { deps } = makeDeps({
      nodes: [
        node({
          enrichment: {
            ...enrichment(),
            checkSpecs: [
              ...enrichment().checkSpecs,
              {
                answerKey: null,
                id: "extra-1",
                kind: "case",
                prompt: "延伸题一",
                rubric: "要点",
              },
            ],
          },
        }),
      ],
    });

    await applyStudyScoutAction(
      { action: "quiz", digestId: DIGEST_ID, index: 0, profileId: "profile-1" },
      deps
    );

    const updated = vi.mocked(deps.updateStudyNodeEnrichment).mock
      .calls[0]?.[0] as {
      enrichment: { checkSpecs: Array<{ prompt: string }> };
    };
    const prompts = updated.enrichment.checkSpecs.map((spec) => spec.prompt);

    expect(prompts.filter((prompt) => prompt === "延伸题一")).toHaveLength(1);
    expect(prompts).toHaveLength(6);
  });

  test("ignores a repeated quiz request", async () => {
    const { deps } = makeDeps({
      events: [
        digestEvent(),
        {
          createdAt: "2026-05-20T01:00:00.000Z",
          payload: { digestId: DIGEST_ID, index: 0 },
          type: "study.scout_quiz",
        },
      ],
    });

    const result = await applyStudyScoutAction(
      { action: "quiz", digestId: DIGEST_ID, index: 0, profileId: "profile-1" },
      deps
    );

    expect(deps.updateStudyNodeEnrichment).not.toHaveBeenCalled();
    expect(result?.ack).toContain("已经处理过");
  });

  test("records skip and later feedback with the suppression keys", async () => {
    const skipDeps = makeDeps();
    await applyStudyScoutAction(
      { action: "skip", digestId: DIGEST_ID, index: 0, profileId: "profile-1" },
      skipDeps.deps
    );

    expect(skipDeps.appendEvent).toHaveBeenCalledWith(
      "profile-1",
      "study.scout_feedback",
      expect.objectContaining({
        action: "skip",
        digestId: DIGEST_ID,
        host: "zhihu.com",
        index: 0,
        localDate: "2026-05-20",
        topicKey: "node-1",
      })
    );

    const laterDeps = makeDeps();
    const later = await applyStudyScoutAction(
      {
        action: "later",
        digestId: DIGEST_ID,
        index: 1,
        profileId: "profile-1",
      },
      laterDeps.deps
    );

    expect(laterDeps.appendEvent).toHaveBeenCalledWith(
      "profile-1",
      "study.scout_feedback",
      expect.objectContaining({ action: "later", index: 1 })
    );
    expect(later?.ack).toBe("记下了，这类材料过几天再推。");
  });
});
