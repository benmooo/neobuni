import type {
  StudyGoalConfig,
  StudyPlanNode,
  StudySession,
} from "@neobuni/contracts";
import { Effect } from "effect";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  runStudyReminderSweep,
  type StudyReminderConfig,
  type StudyReminderDeps,
} from "./reminder-worker";

const config: StudyGoalConfig = {
  targetAt: "2027-05-23T00:00:00.000Z",
  dailyMinutes: 90,
  studyWindow: { start: "20:00", end: "22:30" },
  restDays: [0],
  timezone: "Asia/Shanghai",
  quietHours: null,
  channels: [{ platform: "telegram", targetAlias: "me", targetId: null }],
  syllabusTemplateId: "system-architect-2026",
  planStyle: {
    maxLessonMinutes: 45,
    minLessonMinutes: 20,
    reviewRatio: 0.35,
  },
};

const node: StudyPlanNode = {
  id: "lesson-1",
  planId: "plan-1",
  parentId: "topic-1",
  kind: "lesson",
  order: 1,
  title: "Quality attributes",
  objective: "Explain quality attributes",
  whatText: "Quality attributes and trade-offs",
  howText: "Draw a scenario and explain two tactics",
  resources: [],
  estimatedMinutes: 40,
  weight: 1,
  paper: "case",
  syllabusRefs: ["topic.quality"],
  prerequisites: [],
  checkSpecs: [],
};

const session: StudySession = {
  id: "session-1",
  profileId: "profile-1",
  goalId: "goal-1",
  planNodeId: "lesson-1",
  scheduledFor: "2026-10-26T20:30",
  timezone: "Asia/Shanghai",
  durationMinutes: 40,
  status: "planned",
  startedAt: null,
  completedAt: null,
  actualMinutes: null,
  rescheduledFrom: null,
  notes: null,
  createdAt: "2026-10-25T00:00:00.000Z",
  updatedAt: "2026-10-25T00:00:00.000Z",
};

const reminderConfig: StudyReminderConfig = {
  enabled: true,
  leadMinutes: 60,
  maxPerDay: 2,
  tickMs: 60_000,
};

const now = new Date("2026-10-26T12:00:00.000Z");

const makeDeps = (input?: {
  events?: Array<{
    id: string;
    profileId: string;
    type: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
  goalConfig?: StudyGoalConfig;
  sessions?: StudySession[];
}): StudyReminderDeps =>
  ({
    appendEvent: vi.fn(() => Effect.succeed(null)),
    getLatestStudyPlan: vi.fn(() =>
      Effect.succeed({ nodes: [node], plan: { id: "plan-1" } })
    ),
    getStudyGoalConfig: vi.fn(() =>
      Effect.succeed(input?.goalConfig ?? config)
    ),
    listActiveProfiles: vi.fn(() => Effect.succeed([{ id: "profile-1" }])),
    listEvents: vi.fn(() => Effect.succeed(input?.events ?? [])),
    listGoals: vi.fn(() => Effect.succeed([{ id: "goal-1" }])),
    listStudySessions: vi.fn(() =>
      Effect.succeed(input?.sessions ?? [session])
    ),
    sendDiscordMessage: vi.fn(async () => ({})),
    sendFeishuMessage: vi.fn(async () => ({})),
    sendQqMessage: vi.fn(async () => ({})),
    sendTelegramMessage: vi.fn(async () => ({})),
  }) as unknown as StudyReminderDeps;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runStudyReminderSweep", () => {
  test("sends a reminder for a session inside the lead window", async () => {
    const deps = makeDeps();

    const result = await runStudyReminderSweep({
      config: reminderConfig,
      deps,
      now,
    });

    expect(deps.sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(deps.sendTelegramMessage).toHaveBeenCalledWith(
      "profile-1",
      expect.objectContaining({
        message: expect.objectContaining({ type: "text" }),
        targetAlias: "me",
      })
    );
    expect(deps.appendEvent).toHaveBeenCalledWith(
      "profile-1",
      "study.reminder_sent",
      expect.objectContaining({ sessionId: "session-1" })
    );
    expect(result).toMatchObject({ delivered: 1, reminderCount: 1 });
  });

  test("does not send during quiet hours", async () => {
    const deps = makeDeps({
      goalConfig: {
        ...config,
        quietHours: { start: "19:00", end: "21:00" },
      },
    });

    await runStudyReminderSweep({ config: reminderConfig, deps, now });

    expect(deps.sendTelegramMessage).not.toHaveBeenCalled();
  });

  test("does not resend a reminder for the same session", async () => {
    const deps = makeDeps({
      events: [
        {
          id: "event-1",
          profileId: "profile-1",
          type: "study.reminder_sent",
          payload: { sessionId: "session-1" },
          createdAt: "2026-10-26T12:00:00.000Z",
        },
      ],
    });

    await runStudyReminderSweep({ config: reminderConfig, deps, now });

    expect(deps.sendTelegramMessage).not.toHaveBeenCalled();
  });

  test("respects the daily reminder cap", async () => {
    const deps = makeDeps({
      events: [
        {
          id: "event-1",
          profileId: "profile-1",
          type: "study.reminder_sent",
          payload: { sessionId: "old-1" },
          createdAt: "2026-10-26T01:00:00.000Z",
        },
        {
          id: "event-2",
          profileId: "profile-1",
          type: "study.reminder_sent",
          payload: { sessionId: "old-2" },
          createdAt: "2026-10-26T02:00:00.000Z",
        },
      ],
    });

    await runStudyReminderSweep({ config: reminderConfig, deps, now });

    expect(deps.sendTelegramMessage).not.toHaveBeenCalled();
  });

  test("still reminds for a session missed earlier today", async () => {
    const deps = makeDeps({
      sessions: [{ ...session, scheduledFor: "2026-10-26T18:00" }],
    });

    await runStudyReminderSweep({ config: reminderConfig, deps, now });

    expect(deps.sendTelegramMessage).toHaveBeenCalledTimes(1);
  });

  test("does nothing when there are no channels", async () => {
    const deps = makeDeps({
      goalConfig: { ...config, channels: [] },
    });

    const result = await runStudyReminderSweep({
      config: reminderConfig,
      deps,
      now,
    });

    expect(deps.sendTelegramMessage).not.toHaveBeenCalled();
    expect(result.reminderCount).toBe(0);
  });
});
