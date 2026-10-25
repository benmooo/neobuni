import type {
  StudyGoalConfig,
  StudyPlanNode,
  StudySession,
} from "@neobuni/contracts";
import { describe, expect, test } from "vitest";

import {
  isStudySessionDue,
  scheduleStudySessions,
  selectNextStudySession,
} from "./schedule";

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
  order: number;
  prerequisites?: string[];
  minutes?: number;
}): StudyPlanNode => ({
  id: input.id,
  planId: "plan-1",
  parentId: "topic-1",
  kind: "lesson",
  order: input.order,
  title: `Lesson ${input.id}`,
  objective: "Objective",
  whatText: "What",
  howText: "How",
  resources: [],
  estimatedMinutes: input.minutes ?? 45,
  weight: 1,
  paper: "shared",
  syllabusRefs: ["ref"],
  prerequisites: input.prerequisites ?? [],
  checkSpecs,
});

const config = (overrides: Partial<StudyGoalConfig> = {}): StudyGoalConfig => ({
  targetAt: "2027-05-23T00:00:00.000Z",
  dailyMinutes: 90,
  studyWindow: { start: "20:00", end: "22:30" },
  restDays: [],
  timezone: "Asia/Shanghai",
  quietHours: null,
  channels: [],
  syllabusTemplateId: "system-architect-2026",
  planStyle: {
    maxLessonMinutes: 45,
    minLessonMinutes: 20,
    reviewRatio: 0.35,
  },
  ...overrides,
});

const session = (input: {
  id: string;
  planNodeId: string;
  scheduledFor: string;
  status?: StudySession["status"];
}): StudySession => ({
  id: input.id,
  profileId: "profile-1",
  goalId: "goal-1",
  planNodeId: input.planNodeId,
  scheduledFor: input.scheduledFor,
  timezone: "Asia/Shanghai",
  durationMinutes: 45,
  status: input.status ?? "planned",
  startedAt: null,
  completedAt: null,
  actualMinutes: null,
  rescheduledFrom: null,
  notes: null,
  createdAt: "2026-10-25T00:00:00.000Z",
  updatedAt: "2026-10-25T00:00:00.000Z",
});

describe("scheduleStudySessions", () => {
  test("fills each study day up to the daily budget", () => {
    const result = scheduleStudySessions({
      config: config(),
      days: 2,
      nodes: [
        lesson({ id: "a", order: 1 }),
        lesson({ id: "b", order: 2 }),
        lesson({ id: "c", order: 3 }),
        lesson({ id: "d", order: 4 }),
      ],
      startDate: "2026-10-26",
    });

    expect(result.sessions.map((item) => item.planNodeId)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(result.sessions[0]?.scheduledFor).toBe("2026-10-26T20:00");
    expect(result.sessions[1]?.scheduledFor).toBe("2026-10-26T20:50");
    expect(result.sessions[2]?.scheduledFor).toBe("2026-10-27T20:00");
    expect(result.unscheduledLessonIds).toEqual([]);
  });

  test("skips rest days", () => {
    const result = scheduleStudySessions({
      config: config({ restDays: [1] }),
      days: 2,
      nodes: [lesson({ id: "a", order: 1 })],
      startDate: "2026-10-26",
    });

    expect(result.sessions[0]?.localDate).toBe("2026-10-27");
  });

  test("schedules prerequisites before dependants", () => {
    const result = scheduleStudySessions({
      config: config(),
      days: 1,
      nodes: [
        lesson({ id: "dependant", order: 1, prerequisites: ["prerequisite"] }),
        lesson({ id: "prerequisite", order: 2 }),
      ],
      startDate: "2026-10-26",
    });

    expect(result.sessions.map((item) => item.planNodeId)).toEqual([
      "prerequisite",
      "dependant",
    ]);
  });

  test("reports lessons that do not fit into the requested window", () => {
    const result = scheduleStudySessions({
      config: config(),
      days: 1,
      nodes: Array.from({ length: 10 }, (_, index) =>
        lesson({ id: `lesson-${index}`, order: index })
      ),
      startDate: "2026-10-26",
    });

    expect(result.sessions).toHaveLength(2);
    expect(result.unscheduledLessonIds).toHaveLength(8);
  });

  test("respects an explicit max new lessons per day", () => {
    const result = scheduleStudySessions({
      config: config(),
      days: 3,
      maxNewPerDay: 1,
      nodes: Array.from({ length: 6 }, (_, index) =>
        lesson({ id: `lesson-${index}`, order: index })
      ),
      startDate: "2026-10-26",
    });

    expect(result.sessions).toHaveLength(3);
    expect(result.unscheduledLessonIds).toHaveLength(3);
    expect(result.sessions.map((item) => item.scheduledFor)).toEqual([
      "2026-10-26T20:00",
      "2026-10-27T20:00",
      "2026-10-28T20:00",
    ]);
  });

  test("does not schedule a lesson twice when it is already in progress", () => {
    const result = scheduleStudySessions({
      config: config(),
      days: 1,
      existingSessions: [{ planNodeId: "a", status: "completed" }],
      nodes: [lesson({ id: "a", order: 1 }), lesson({ id: "b", order: 2 })],
      startDate: "2026-10-26",
    });

    expect(result.sessions.map((item) => item.planNodeId)).toEqual(["b"]);
  });
});

describe("selectNextStudySession", () => {
  test("prefers an overdue session over a future one", () => {
    const sessions = [
      session({
        id: "future",
        planNodeId: "b",
        scheduledFor: "2026-10-28T20:00",
      }),
      session({
        id: "due",
        planNodeId: "a",
        scheduledFor: "2026-10-26T20:00",
      }),
    ];

    expect(
      selectNextStudySession({
        nowLocalDateTime: "2026-10-27T09:00",
        sessions,
      })?.id
    ).toBe("due");
  });

  test("falls back to the next planned session", () => {
    const sessions = [
      session({
        id: "future",
        planNodeId: "b",
        scheduledFor: "2026-10-28T20:00",
      }),
    ];

    expect(
      selectNextStudySession({
        nowLocalDateTime: "2026-10-27T09:00",
        sessions,
      })?.id
    ).toBe("future");
  });

  test("ignores completed sessions", () => {
    expect(
      isStudySessionDue(
        { scheduledFor: "2026-10-26T20:00", status: "completed" },
        "2026-10-27T09:00"
      )
    ).toBe(false);
  });
});
