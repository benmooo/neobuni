import type {
  StudyGoalConfig,
  StudyPlanNode,
  StudySession,
} from "@neobuni/contracts";
import { describe, expect, test } from "vitest";

import {
  buildStudyNudges,
  countNudgesOnDate,
  deliveredNudgeKeys,
  readNudgeSettings,
  type StudyNudgeEvent,
} from "./nudge-service";

const config: StudyGoalConfig = {
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

const node = (id: string, title: string): StudyPlanNode => ({
  checkSpecs: [],
  estimatedMinutes: 40,
  howText: "how",
  id,
  kind: "lesson",
  objective: "objective",
  order: 1,
  paper: "case",
  parentId: "topic-1",
  planId: "plan-1",
  prerequisites: [],
  resources: [],
  syllabusRefs: [],
  title,
  weight: 1,
  whatText: "what",
});

const session = (
  overrides: Partial<StudySession> & Pick<StudySession, "id" | "scheduledFor">
): StudySession =>
  ({
    actualMinutes: null,
    completedAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    durationMinutes: 40,
    goalId: "goal-1",
    notes: null,
    planNodeId: "lesson-1",
    profileId: "profile-1",
    rescheduledFrom: null,
    startedAt: null,
    status: "planned",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  }) as StudySession;

const build = (input: {
  events?: StudyNudgeEvent[];
  localDate?: string;
  nodes?: StudyPlanNode[];
  nowLocalDateTime: string;
  sessions: StudySession[];
}) =>
  buildStudyNudges({
    config,
    events: input.events ?? [],
    leadMinutes: 60,
    localDate: input.localDate ?? "2026-10-26",
    nodes: input.nodes ?? [node("lesson-1", "Quality attributes")],
    nowLocalDateTime: input.nowLocalDateTime,
    sessions: input.sessions,
    settings: readNudgeSettings(config),
  });

describe("buildStudyNudges", () => {
  test("sends the day plan before the study window opens", () => {
    const nudges = build({
      nowLocalDateTime: "2026-10-26T19:45",
      sessions: [
        session({ id: "s1", scheduledFor: "2026-10-26T20:30" }),
        session({
          id: "s2",
          planNodeId: "lesson-2",
          scheduledFor: "2026-10-26T21:20",
        }),
      ],
      nodes: [
        node("lesson-1", "Quality attributes"),
        node("lesson-2", "Tactics"),
      ],
    });

    expect(nudges.map((nudge) => nudge.kind)).toEqual(["daily_plan"]);
    expect(nudges[0]?.dedupeKey).toBe("daily_plan:2026-10-26");
    expect(nudges[0]?.text).toContain("今天 20:00 开始 · 2 节 · 80 分钟");
  });

  test("does not send the day plan once the window has opened", () => {
    const nudges = build({
      nowLocalDateTime: "2026-10-26T20:00",
      sessions: [session({ id: "s1", scheduledFor: "2026-10-26T20:30" })],
    });

    expect(nudges.map((nudge) => nudge.kind)).toEqual(["session_due"]);
  });

  test("suppresses session_due once the day plan already listed it", () => {
    const events: StudyNudgeEvent[] = [
      {
        createdAt: "2026-10-26T11:45:00.000Z",
        payload: { dedupeKey: "daily_plan:2026-10-26", kind: "daily_plan" },
        type: "study.nudge_sent",
      },
    ];
    const nudges = build({
      events,
      nowLocalDateTime: "2026-10-26T20:00",
      sessions: [session({ id: "s1", scheduledFor: "2026-10-26T20:30" })],
    });

    expect(nudges).toHaveLength(0);
  });

  test("switches to streak recovery after two missed days", () => {
    const nudges = build({
      nowLocalDateTime: "2026-10-26T19:40",
      sessions: [
        session({
          id: "past-1",
          scheduledFor: "2026-10-24T20:30",
          status: "missed",
        }),
        session({
          id: "past-2",
          scheduledFor: "2026-10-25T20:30",
          status: "skipped",
        }),
        session({ id: "s1", scheduledFor: "2026-10-26T20:30" }),
      ],
    });

    expect(nudges[0]?.kind).toBe("streak_recovery");
    expect(nudges[0]?.text).toContain("已经 2 天没有完成学习");
  });

  test("nudges wrap-up near the end of the window", () => {
    const nudges = build({
      nowLocalDateTime: "2026-10-26T22:20",
      sessions: [
        session({
          actualMinutes: 35,
          completedAt: "2026-10-26T20:40:00.000Z",
          id: "s1",
          scheduledFor: "2026-10-26T20:30",
          status: "completed",
        }),
        session({ id: "s2", scheduledFor: "2026-10-26T21:20" }),
      ],
    });

    expect(nudges.map((nudge) => nudge.kind)).toEqual([
      "session_due",
      "wrap_up",
    ]);
    expect(nudges[1]?.text).toContain("今天完成 1/2 节 · 35 分钟。");
  });

  test("skips a session that is snoozed into the future", () => {
    const events: StudyNudgeEvent[] = [
      {
        createdAt: "2026-10-26T11:30:00.000Z",
        payload: { sessionId: "s1", snoozeUntil: "2026-10-26T20:15" },
        type: "study.reminder_snoozed",
      },
    ];
    const nudges = build({
      events,
      nowLocalDateTime: "2026-10-26T20:00",
      sessions: [session({ id: "s1", scheduledFor: "2026-10-26T20:30" })],
    });

    expect(nudges).toHaveLength(0);
  });
});

describe("nudge event bookkeeping", () => {
  const events: StudyNudgeEvent[] = [
    {
      createdAt: "2026-10-26T11:45:00.000Z",
      payload: { dedupeKey: "daily_plan:2026-10-26" },
      type: "study.nudge_sent",
    },
    {
      createdAt: "2026-10-26T12:00:00.000Z",
      payload: { scheduledFor: "2026-10-26T20:30", sessionId: "s1" },
      type: "study.reminder_sent",
    },
  ];

  test("merges new and legacy dedupe keys", () => {
    const keys = deliveredNudgeKeys(events);
    expect(keys.has("daily_plan:2026-10-26")).toBe(true);
    expect(keys.has("session_due:s1:2026-10-26T20:30")).toBe(true);
  });

  test("counts both event types against the daily budget", () => {
    expect(countNudgesOnDate(events, "2026-10-26", "Asia/Shanghai")).toBe(2);
    expect(countNudgesOnDate(events, "2026-10-27", "Asia/Shanghai")).toBe(0);
  });

  test("counts scout digests against the same budget", () => {
    const shared: StudyNudgeEvent[] = [
      ...events,
      {
        createdAt: "2026-10-26T11:45:00.000Z",
        payload: { digestId: "ab12cd34", localDate: "2026-10-26" },
        type: "study.scout_sent",
      },
    ];

    expect(countNudgesOnDate(shared, "2026-10-26", "Asia/Shanghai")).toBe(3);
  });
});
