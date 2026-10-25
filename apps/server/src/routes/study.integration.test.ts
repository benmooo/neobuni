import {
  getClient,
  listStudyChecks,
  listStudyMastery,
  listStudySessions,
  runRepo,
} from "@neobuni/db";
import {
  executeStatements,
  setupTestDatabase,
  type TestDatabase,
} from "@neobuni/db/testing/test-database";
import { call } from "@orpc/server";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createTestContext } from "./test-support";

const { studyRouter } = await import("../routers/study");

let testDatabase: TestDatabase;

const config = {
  channels: [],
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

beforeAll(async () => {
  testDatabase = await setupTestDatabase("study-router");
  const client = getClient();
  const now = Date.now();
  await client.execute({
    sql: "INSERT INTO `user` (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
    args: ["user-1", "Test", "study-router@example.com", now, now],
  });
  await client.execute({
    sql: "INSERT INTO profiles (id, owner_user_id, name, kind, timezone, created_at, updated_at) VALUES (?, ?, ?, 'personal', ?, ?, ?)",
    args: [
      "profile-1",
      "user-1",
      "Study Router",
      "Asia/Shanghai",
      "2026-10-21T00:00:00.000Z",
      "2026-10-21T00:00:00.000Z",
    ],
  });
});

afterAll(async () => {
  await executeStatements([
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
  testDatabase.cleanup();
});

describe("study router end to end", () => {
  test("creates, schedules, checks and reviews a study goal", async () => {
    const context = createTestContext();
    const started = await call(
      studyRouter.goals.start,
      {
        autonomyMode: "collaborate",
        config,
        desiredOutcome: "Pass all three papers",
        title: "系统架构设计师",
      },
      { context }
    );

    expect(started.goal.id).toBeTruthy();
    expect(started.plan.status).toBe("active");
    expect(started.sessions.length).toBeGreaterThan(100);

    const today = await call(
      studyRouter.today,
      { goalId: started.goal.id },
      { context }
    );
    expect(today.primary).not.toBeNull();
    expect(today.progress.coverage).toBe(0);
    expect(today.upcoming.length).toBeGreaterThan(0);

    const primary = today.primary;
    if (!primary) {
      throw new Error("Expected a primary session");
    }
    const answers = primary.node.checkSpecs.map((spec) => ({
      answer:
        "This is a sufficiently detailed answer that explains the idea, gives a concrete example, and names one trade-off.",
      promptId: spec.id,
    }));
    const graded = await call(
      studyRouter.checks.submit,
      { answers, sessionId: primary.session.id },
      { context }
    );

    expect(graded.passed).toBe(true);
    expect(graded.items).toHaveLength(primary.node.checkSpecs.length);
    expect(graded.mastery).toBeGreaterThan(0);
    expect(graded.nextReviewAt).not.toBeNull();

    const checks = await runRepo(listStudyChecks(started.goal.id));
    expect(checks).toHaveLength(primary.node.checkSpecs.length);
    const mastery = await runRepo(listStudyMastery(started.goal.id));
    expect(mastery).toHaveLength(1);
    const sessions = await runRepo(listStudySessions(started.goal.id));
    expect(sessions.some((session) => session.status === "completed")).toBe(
      true
    );
    expect(sessions.length).toBeGreaterThan(started.sessions.length);

    const after = await call(
      studyRouter.today,
      { goalId: started.goal.id },
      { context }
    );
    expect(after.progress.coverage).toBeGreaterThan(0);
    expect(after.primary?.session.id).not.toBe(primary.session.id);
  });
});
