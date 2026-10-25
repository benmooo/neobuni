import { call } from "@orpc/server";
import { Effect } from "effect";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { captureOrpcError, createTestContext } from "./test-support";

const mocks = vi.hoisted(() => ({
  activateStudyPlan: vi.fn(),
  appendEvent: vi.fn(),
  createGoal: vi.fn(),
  createStudyCheck: vi.fn(),
  createStudyPlan: vi.fn(),
  createStudySessions: vi.fn(),
  getGoal: vi.fn(),
  getLatestStudyPlan: vi.fn(),
  getStudyGoalConfig: vi.fn(),
  getStudyPlan: vi.fn(),
  getStudySession: vi.fn(),
  gradeStudyChecks: vi.fn(),
  listStudyChecks: vi.fn(),
  listStudyMastery: vi.fn(),
  listStudySessions: vi.fn(),
  updateStudySession: vi.fn(),
  upsertStudyGoalConfig: vi.fn(),
  upsertStudyMastery: vi.fn(),
}));

vi.mock("@neobuni/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@neobuni/db")>();
  return {
    ...actual,
    activateStudyPlan: mocks.activateStudyPlan,
    appendEvent: mocks.appendEvent,
    createGoal: mocks.createGoal,
    createStudyCheck: mocks.createStudyCheck,
    createStudyPlan: mocks.createStudyPlan,
    createStudySessions: mocks.createStudySessions,
    getGoal: mocks.getGoal,
    getLatestStudyPlan: mocks.getLatestStudyPlan,
    getStudyGoalConfig: mocks.getStudyGoalConfig,
    getStudyPlan: mocks.getStudyPlan,
    getStudySession: mocks.getStudySession,
    listStudyChecks: mocks.listStudyChecks,
    listStudyMastery: mocks.listStudyMastery,
    listStudySessions: mocks.listStudySessions,
    updateStudySession: mocks.updateStudySession,
    upsertStudyGoalConfig: mocks.upsertStudyGoalConfig,
    upsertStudyMastery: mocks.upsertStudyMastery,
  };
});

vi.mock("../study/grading-service", () => ({
  gradeStudyChecks: mocks.gradeStudyChecks,
}));

const { studyRouter } = await import("../routers/study");

const goal = {
  id: "goal-1",
  profileId: "profile-1",
  title: "Pass the exam",
  desiredOutcome: "Pass all three papers",
  status: "active" as const,
  horizon: "project" as const,
  successCriteria: [],
  constraints: [],
  autonomyMode: "collaborate" as const,
  planVersion: 0,
  nextReviewAt: null,
  createdAt: "2026-10-25T00:00:00.000Z",
  updatedAt: "2026-10-25T00:00:00.000Z",
};

const config = {
  targetAt: "2027-05-23T00:00:00.000Z",
  dailyMinutes: 90,
  studyWindow: { start: "20:00", end: "22:30" },
  restDays: [0],
  timezone: "Asia/Shanghai",
  quietHours: null,
  channels: [],
  syllabusTemplateId: "system-architect-2026",
  planStyle: {
    maxLessonMinutes: 45,
    minLessonMinutes: 20,
    reviewRatio: 0.35,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.appendEvent.mockReturnValue(Effect.succeed(null));
  mocks.upsertStudyGoalConfig.mockImplementation((input: { config: unknown }) =>
    Effect.succeed(input.config)
  );
  mocks.createStudyPlan.mockImplementation(
    (input: { nodes: unknown[]; plan: Record<string, unknown> }) =>
      Effect.succeed({ nodes: input.nodes, plan: input.plan })
  );
  mocks.getStudySession.mockReturnValue(Effect.succeed(null));
  mocks.updateStudySession.mockReturnValue(Effect.succeed(null));
  mocks.listStudyChecks.mockReturnValue(Effect.succeed([]));
  mocks.listStudyMastery.mockReturnValue(Effect.succeed([]));
  mocks.listStudySessions.mockReturnValue(Effect.succeed([]));
  mocks.createStudyCheck.mockImplementation((input: { prompt: string }) =>
    Effect.succeed({ id: `check-${input.prompt}` })
  );
  mocks.createStudySessions.mockReturnValue(Effect.succeed([]));
  mocks.upsertStudyMastery.mockImplementation(
    (input: Record<string, unknown>) => Effect.succeed(input)
  );
  mocks.updateStudySession.mockReturnValue(Effect.succeed({}));
  mocks.gradeStudyChecks.mockResolvedValue({
    grades: [
      {
        feedback: "Good",
        missingPoints: [],
        passed: true,
        promptId: "c1",
        score: 0.8,
      },
      {
        feedback: "Good",
        missingPoints: [],
        passed: true,
        promptId: "c2",
        score: 0.7,
      },
      {
        feedback: "Gap",
        missingPoints: ["x"],
        passed: false,
        promptId: "c3",
        score: 0.4,
      },
    ],
    gradedBy: "llm",
  });
});

describe("study router", () => {
  test("creates a study goal and its config", async () => {
    mocks.createGoal.mockReturnValue(Effect.succeed(goal));

    const result = await call(
      studyRouter.goals.create,
      {
        autonomyMode: "collaborate",
        config,
        desiredOutcome: goal.desiredOutcome,
        title: goal.title,
      },
      { context: createTestContext() }
    );

    expect(result.goal).toMatchObject({ id: "goal-1" });
    expect(result.config).toMatchObject({
      dailyMinutes: 90,
      syllabusTemplateId: "system-architect-2026",
    });
    expect(mocks.createGoal.mock.calls[0]?.[0]).toMatchObject({
      profileId: "profile-1",
      status: "active",
    });
  });

  test("generates a deterministic draft plan", async () => {
    mocks.getGoal.mockReturnValue(Effect.succeed(goal));
    mocks.getStudyGoalConfig.mockReturnValue(Effect.succeed(config));
    mocks.getLatestStudyPlan.mockReturnValue(Effect.succeed(null));

    const result = await call(
      studyRouter.plans.generate,
      { goalId: "goal-1" },
      { context: createTestContext() }
    );

    expect(result.plan).toMatchObject({ goalId: "goal-1", status: "draft" });
    expect(result.lessonCount).toBeGreaterThan(62);
    expect(result.nodes.length).toBeGreaterThan(result.lessonCount);
    expect(result.totalMinutes).toBe(6300);
  });

  test("grades checks, writes mastery and completes the session", async () => {
    mocks.getStudySession.mockReturnValue(
      Effect.succeed({
        durationMinutes: 40,
        goalId: "goal-1",
        id: "session-1",
        planNodeId: "lesson-1",
        profileId: "profile-1",
        startedAt: null,
        status: "planned",
      })
    );
    mocks.getLatestStudyPlan.mockReturnValue(
      Effect.succeed({
        nodes: [
          {
            checkSpecs: [
              { id: "c1", kind: "recall", prompt: "Recall", rubric: null },
              { id: "c2", kind: "case", prompt: "Apply", rubric: null },
              { id: "c3", kind: "case", prompt: "Transfer", rubric: null },
            ],
            enrichment: {
              checkSpecs: [
                {
                  id: "e1",
                  kind: "recall",
                  prompt: "Enriched recall",
                  rubric: null,
                },
                {
                  id: "e2",
                  kind: "case",
                  prompt: "Enriched apply",
                  rubric: "Points",
                },
                {
                  id: "e3",
                  kind: "case",
                  prompt: "Enriched transfer",
                  rubric: "Points",
                },
              ],
              enrichedAt: "2026-10-25T00:00:00.000Z",
              howText: "Enriched how",
              objective: "Enriched objective",
              resources: [],
              source: "llm",
              whatText: "Enriched what",
            },
            estimatedMinutes: 40,
            id: "lesson-1",
            objective: "Explain quality attributes",
            title: "Quality attributes",
          },
        ],
        plan: { goalId: "goal-1", status: "active" },
      })
    );
    mocks.getStudyGoalConfig.mockReturnValue(Effect.succeed(config));

    const result = await call(
      studyRouter.checks.submit,
      {
        answers: [
          { answer: "a1", promptId: "e1" },
          { answer: "a2", promptId: "e2" },
          { answer: "a3", promptId: "e3" },
        ],
        sessionId: "session-1",
      },
      { context: createTestContext() }
    );

    expect(result).toMatchObject({
      maxScore: 1,
      needsReteach: false,
      passed: true,
    });
    expect(result.checkIds).toHaveLength(3);
    expect(result.items).toHaveLength(3);
    expect(mocks.upsertStudyMastery).toHaveBeenCalledTimes(1);
    expect(mocks.updateStudySession).toHaveBeenCalledTimes(1);
    expect(mocks.gradeStudyChecks.mock.calls[0]?.[0].checks).toEqual([
      expect.objectContaining({ id: "e1" }),
      expect.objectContaining({ id: "e2" }),
      expect.objectContaining({ id: "e3" }),
    ]);
  });

  test("rejects a session that belongs to another profile", async () => {
    mocks.getStudySession.mockReturnValue(
      Effect.succeed({ id: "session-1", profileId: "profile-2" })
    );

    const error = await captureOrpcError(() =>
      call(
        studyRouter.sessions.complete,
        { actualMinutes: 40, sessionId: "session-1" },
        { context: createTestContext() }
      )
    );

    expect(error.code).toBe("NOT_FOUND");
  });
});
