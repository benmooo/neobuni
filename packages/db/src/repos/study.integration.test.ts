import {
  buildStudyPlanDraft,
  systemArchitect2026Template,
} from "@neobuni/core";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";

import { getClient } from "../client";
import { runRepo } from "../run";
import {
  executeStatements,
  setupTestDatabase,
  type TestDatabase,
} from "../testing/test-database";
import { createGoal } from "./goals";
import {
  activateStudyPlan,
  createStudyCheck,
  createStudyPlan,
  createStudySessions,
  getLatestStudyPlan,
  getStudyGoalConfig,
  getStudyPlan,
  getStudySession,
  listStudyChecks,
  listStudyMastery,
  listStudySessions,
  updateStudySession,
  upsertStudyGoalConfig,
  upsertStudyMastery,
} from "./study";

let testDatabase: TestDatabase;

const resetTables = () =>
  executeStatements([
    "DELETE FROM study_checks",
    "DELETE FROM study_mastery",
    "DELETE FROM study_sessions",
    "DELETE FROM study_plan_nodes",
    "DELETE FROM study_plans",
    "DELETE FROM study_goal_configs",
    "DELETE FROM goals",
    "DELETE FROM profiles",
    "DELETE FROM `user`",
  ]);

const seedProfile = async () => {
  const client = getClient();
  const now = Date.now();

  await client.execute({
    sql: "INSERT INTO `user` (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
    args: ["user-1", "Test", "study@example.com", now, now],
  });

  await client.execute({
    sql: "INSERT INTO profiles (id, owner_user_id, name, kind, timezone, created_at, updated_at) VALUES (?, ?, ?, 'personal', ?, ?, ?)",
    args: [
      "profile-1",
      "user-1",
      "Study Test",
      "Asia/Shanghai",
      "2026-10-21T00:00:00.000Z",
      "2026-10-21T00:00:00.000Z",
    ],
  });
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

const makeGoal = () =>
  runRepo(
    createGoal({
      profileId: "profile-1",
      title: "Pass the system architect exam",
      desiredOutcome: "Pass all three papers",
      status: "active",
      horizon: "project",
      successCriteria: [],
      constraints: [],
      autonomyMode: "collaborate",
      planVersion: 0,
      nextReviewAt: null,
    })
  );

describe("study repositories", () => {
  beforeAll(async () => {
    testDatabase = await setupTestDatabase("study");
  });

  beforeEach(async () => {
    await resetTables();
    await seedProfile();
  });

  afterAll(() => {
    testDatabase.cleanup();
  });

  test("stores and reads the study goal config", async () => {
    const goal = await makeGoal();
    await runRepo(
      upsertStudyGoalConfig({
        config,
        goalId: goal.id,
        profileId: "profile-1",
      })
    );

    expect(await runRepo(getStudyGoalConfig(goal.id))).toMatchObject({
      dailyMinutes: 90,
      syllabusTemplateId: "system-architect-2026",
    });
  });

  test("persists a generated plan and activates it", async () => {
    const goal = await makeGoal();
    const planId = crypto.randomUUID();
    const draft = buildStudyPlanDraft({
      planId,
      template: systemArchitect2026Template,
    });

    await runRepo(
      createStudyPlan({
        nodes: draft.nodes,
        plan: {
          diagnostics: draft.diagnostics,
          goalId: goal.id,
          id: planId,
          profileId: "profile-1",
          status: "draft",
          templateId: systemArchitect2026Template.id,
          version: 1,
        },
      })
    );

    const latest = await runRepo(getLatestStudyPlan({ goalId: goal.id }));
    expect(latest?.plan.status).toBe("draft");
    expect(latest?.nodes.length).toBe(draft.nodes.length);
    expect(latest?.plan.diagnostics).toEqual(draft.diagnostics);

    const activated = await runRepo(
      activateStudyPlan({ goalId: goal.id, planId })
    );
    expect(activated?.plan.status).toBe("active");
    expect(activated?.plan.activatedAt).not.toBeNull();
    expect((await runRepo(getStudyPlan(planId)))?.plan.status).toBe("active");
  });

  test("persists sessions, checks and mastery", async () => {
    const goal = await makeGoal();
    const planId = crypto.randomUUID();
    const draft = buildStudyPlanDraft({
      planId,
      template: systemArchitect2026Template,
    });
    await runRepo(
      createStudyPlan({
        nodes: draft.nodes,
        plan: {
          diagnostics: draft.diagnostics,
          goalId: goal.id,
          id: planId,
          profileId: "profile-1",
          status: "active",
          templateId: systemArchitect2026Template.id,
          version: 1,
        },
      })
    );

    const lesson = draft.nodes.find((node) => node.kind === "lesson");
    expect(lesson).toBeDefined();
    const [session] = await runRepo(
      createStudySessions([
        {
          actualMinutes: null,
          completedAt: null,
          durationMinutes: lesson?.estimatedMinutes ?? 40,
          goalId: goal.id,
          notes: null,
          planNodeId: lesson?.id ?? "",
          profileId: "profile-1",
          rescheduledFrom: null,
          scheduledFor: "2026-10-26T20:00",
          startedAt: null,
          status: "planned",
          timezone: config.timezone,
        },
      ])
    );
    expect(session?.status).toBe("planned");
    expect(await runRepo(getStudySession(session?.id ?? ""))).toMatchObject({
      planNodeId: lesson?.id,
    });

    const completed = await runRepo(
      updateStudySession({
        sessionId: session?.id ?? "",
        patch: {
          actualMinutes: 42,
          completedAt: "2026-10-26T20:45:00.000Z",
          startedAt: "2026-10-26T20:00:00.000Z",
          status: "completed",
        },
      })
    );
    expect(completed).toMatchObject({
      actualMinutes: 42,
      status: "completed",
    });
    expect(await runRepo(listStudySessions(goal.id))).toHaveLength(1);

    await runRepo(
      createStudyCheck({
        answer: "An answer",
        feedback: "Good",
        goalId: goal.id,
        gradedBy: "deterministic",
        kind: "recall",
        maxScore: 1,
        passed: true,
        planNodeId: lesson?.id ?? "",
        profileId: "profile-1",
        prompt: "Recall",
        rubric: null,
        score: 0.8,
        sessionId: session?.id ?? null,
      })
    );
    expect(await runRepo(listStudyChecks(goal.id))).toHaveLength(1);

    await runRepo(
      upsertStudyMastery({
        attempts: 1,
        confidence: 1 / 3,
        goalId: goal.id,
        lastAssessedAt: "2026-10-26T20:45:00.000Z",
        lastScore: 0.8,
        nextReviewAt: "2026-11-02",
        planNodeId: lesson?.id ?? "",
        score: 0.32,
      })
    );
    await runRepo(
      upsertStudyMastery({
        attempts: 2,
        confidence: 2 / 3,
        goalId: goal.id,
        lastAssessedAt: "2026-10-27T20:45:00.000Z",
        lastScore: 1,
        nextReviewAt: "2026-11-10",
        planNodeId: lesson?.id ?? "",
        score: 0.49,
      })
    );
    const mastery = await runRepo(listStudyMastery(goal.id));
    expect(mastery).toHaveLength(1);
    expect(mastery[0]).toMatchObject({ attempts: 2, score: 0.49 });
  });
});
