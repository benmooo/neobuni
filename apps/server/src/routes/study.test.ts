import { call } from "@orpc/server";
import { Effect } from "effect";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { captureOrpcError, createTestContext } from "./test-support";

const mocks = vi.hoisted(() => ({
  activateStudyPlan: vi.fn(),
  appendEvent: vi.fn(),
  createGoal: vi.fn(),
  createStudyPlan: vi.fn(),
  createStudySessions: vi.fn(),
  getGoal: vi.fn(),
  getLatestStudyPlan: vi.fn(),
  getStudyGoalConfig: vi.fn(),
  getStudyPlan: vi.fn(),
  getStudySession: vi.fn(),
  listStudyChecks: vi.fn(),
  listStudyMastery: vi.fn(),
  listStudySessions: vi.fn(),
  updateStudySession: vi.fn(),
  upsertStudyGoalConfig: vi.fn(),
}));

vi.mock("@neobuni/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@neobuni/db")>();
  return {
    ...actual,
    activateStudyPlan: mocks.activateStudyPlan,
    appendEvent: mocks.appendEvent,
    createGoal: mocks.createGoal,
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
  };
});

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
