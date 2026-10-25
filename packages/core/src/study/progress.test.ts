import type {
  StudyCheck,
  StudyMastery,
  StudyPlanNode,
  StudySession,
} from "@neobuni/contracts";
import { describe, expect, test } from "vitest";

import { computeStudyProgress } from "./progress";

const checkSpecs = [
  {
    id: "check-1",
    kind: "recall" as const,
    prompt: "Recall",
    rubric: null,
    answerKey: null,
  },
  {
    id: "check-2",
    kind: "case" as const,
    prompt: "Apply",
    rubric: null,
    answerKey: null,
  },
  {
    id: "check-3",
    kind: "case" as const,
    prompt: "Transfer",
    rubric: null,
    answerKey: null,
  },
];

const lesson = (input: {
  id: string;
  paper: StudyPlanNode["paper"];
  weight?: number;
}): StudyPlanNode => ({
  id: input.id,
  planId: "plan-1",
  parentId: "topic-1",
  kind: "lesson",
  order: 1,
  title: input.id,
  objective: "Objective",
  whatText: "What",
  howText: "How",
  resources: [],
  estimatedMinutes: 45,
  weight: input.weight ?? 1,
  paper: input.paper,
  syllabusRefs: [input.id],
  prerequisites: [],
  checkSpecs,
});

const session = (input: {
  id: string;
  planNodeId: string;
  scheduledFor: string;
  status: StudySession["status"];
  actualMinutes?: number;
}): StudySession => ({
  id: input.id,
  profileId: "profile-1",
  goalId: "goal-1",
  planNodeId: input.planNodeId,
  scheduledFor: input.scheduledFor,
  timezone: "Asia/Shanghai",
  durationMinutes: 45,
  status: input.status,
  startedAt: null,
  completedAt: null,
  actualMinutes: input.actualMinutes ?? null,
  rescheduledFrom: null,
  notes: null,
  createdAt: "2026-10-25T00:00:00.000Z",
  updatedAt: "2026-10-25T00:00:00.000Z",
});

const mastery = (input: {
  planNodeId: string;
  score: number;
}): StudyMastery => ({
  goalId: "goal-1",
  planNodeId: input.planNodeId,
  score: input.score,
  confidence: 1,
  attempts: 3,
  lastScore: input.score,
  lastAssessedAt: "2026-10-25T00:00:00.000Z",
  nextReviewAt: null,
  updatedAt: "2026-10-25T00:00:00.000Z",
});

const mockCheck = (input: {
  planNodeId: string;
  score: number;
}): StudyCheck => ({
  id: "check-mock",
  profileId: "profile-1",
  goalId: "goal-1",
  sessionId: null,
  planNodeId: input.planNodeId,
  kind: "mock",
  prompt: "Mock paper",
  answer: null,
  rubric: null,
  score: input.score,
  maxScore: 75,
  passed: true,
  gradedBy: "deterministic",
  feedback: null,
  createdAt: "2026-10-26T00:00:00.000Z",
});

const nodes = [
  lesson({ id: "comprehensive-1", paper: "comprehensive" }),
  lesson({ id: "case-1", paper: "case" }),
  lesson({ id: "essay-1", paper: "essay" }),
];

describe("computeStudyProgress", () => {
  test("uses the weakest paper as overall readiness", () => {
    const progress = computeStudyProgress({
      checks: [mockCheck({ planNodeId: "comprehensive-1", score: 60 })],
      goalId: "goal-1",
      mastery: [
        mastery({ planNodeId: "comprehensive-1", score: 1 }),
        mastery({ planNodeId: "case-1", score: 0.5 }),
        mastery({ planNodeId: "essay-1", score: 0 }),
      ],
      nodes,
      now: "2026-10-26T09:00:00.000Z",
      nowLocalDateTime: "2026-10-26T09:00",
      sessions: [
        session({
          id: "s-1",
          planNodeId: "comprehensive-1",
          scheduledFor: "2026-10-26T20:00",
          status: "completed",
          actualMinutes: 40,
        }),
        session({
          id: "s-2",
          planNodeId: "case-1",
          scheduledFor: "2026-10-28T20:00",
          status: "planned",
        }),
        session({
          id: "s-3",
          planNodeId: "essay-1",
          scheduledFor: "2026-10-20T20:00",
          status: "missed",
        }),
      ],
      targetAt: "2027-05-23T00:00:00.000Z",
    });

    expect(progress.coverage).toBeCloseTo(1 / 3, 5);
    expect(progress.mastery).toBeCloseTo(0.5, 5);
    expect(progress.perPaper).toEqual([
      expect.objectContaining({
        paper: "comprehensive",
        coverage: 1,
        mastery: 1,
        mockScore: 60,
        readiness: expect.closeTo(0.94, 5),
      }),
      expect.objectContaining({
        paper: "case",
        coverage: 0,
        mastery: 0.5,
        mockScore: null,
        readiness: expect.closeTo(0.35, 5),
      }),
      expect.objectContaining({
        paper: "essay",
        coverage: 0,
        mastery: 0,
        readiness: 0,
      }),
    ]);
    expect(progress.overallReadiness).toBe(0);
    expect(progress.sessionsCompleted).toBe(1);
    expect(progress.sessionsPlanned).toBe(3);
    expect(progress.dueSessions).toBe(0);
    expect(progress.adherenceRate).toBe(0.5);
    expect(progress.streakDays).toBe(1);
    expect(progress.totalMinutes).toBe(40);
    expect(progress.daysRemaining).toBe(209);
    expect(progress.minutesPerDayNeeded).toBeCloseTo((90 * 1.35) / 209, 5);
  });

  test("counts an overdue planned session in the due count", () => {
    const progress = computeStudyProgress({
      checks: [],
      goalId: "goal-1",
      mastery: [],
      nodes,
      now: "2026-10-26T09:00:00.000Z",
      nowLocalDateTime: "2026-10-26T09:00",
      sessions: [
        session({
          id: "s-1",
          planNodeId: "comprehensive-1",
          scheduledFor: "2026-10-25T20:00",
          status: "planned",
        }),
      ],
      targetAt: "2027-05-23T00:00:00.000Z",
    });

    expect(progress.dueSessions).toBe(1);
    expect(progress.adherenceRate).toBe(0);
  });
});
