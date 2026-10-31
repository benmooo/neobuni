import type { StudyGoalConfig, StudySession } from "@neobuni/contracts";
import {
  addLocalDays,
  localDateInTimeZone,
  localDateTimeInTimeZone,
} from "@neobuni/core";
import {
  appendEvent,
  getGoal,
  getLatestStudyPlan,
  getStudyGoalConfig,
  getStudySession,
  listStudySessions,
  runRepo,
  updateStudySession,
  upsertStudyGoalConfig,
} from "@neobuni/db";

import type { StudyNudgeAction } from "./nudge-service";
import { SNOOZE_MINUTES } from "./nudge-service";

interface StudyNudgeActionDeps {
  appendEvent: typeof appendEvent;
  getGoal: typeof getGoal;
  getLatestStudyPlan: typeof getLatestStudyPlan;
  getStudyGoalConfig: typeof getStudyGoalConfig;
  getStudySession: typeof getStudySession;
  listStudySessions: typeof listStudySessions;
  updateStudySession: typeof updateStudySession;
  upsertStudyGoalConfig: typeof upsertStudyGoalConfig;
}

const defaultDeps: StudyNudgeActionDeps = {
  appendEvent,
  getGoal,
  getLatestStudyPlan,
  getStudyGoalConfig,
  getStudySession,
  listStudySessions,
  updateStudySession,
  upsertStudyGoalConfig,
};

const ACTIONS: StudyNudgeAction[] = ["skip", "snooze", "start", "tomorrow"];

/**
 * Callback payload shape: `st:{action}:{sessionId}`.
 * Telegram caps callback_data at 64 bytes; a uuid session id keeps us at 46.
 */
export const parseNudgeCallback = (
  data: string
): { action: StudyNudgeAction; sessionId: string } | null => {
  const match = data.match(/^st:([a-z]+):(.+)$/);
  if (!match) {
    return null;
  }
  const action = match[1] as StudyNudgeAction;
  const sessionId = match[2];
  if (!(ACTIONS.includes(action) && sessionId)) {
    return null;
  }
  return { action, sessionId };
};

export const nudgeCallbackData = (
  action: StudyNudgeAction,
  sessionId: string
): string => `st:${action}:${sessionId}`;

interface NudgeActionResult {
  ack: string;
  text: string;
}

const nextReviewClock = (scheduledFor: string) => scheduledFor.slice(11, 16);

const localDateTimeOf = (instant: Date, timezone: string) =>
  localDateTimeInTimeZone(instant, timezone).slice(0, 16);

const plusMinutes = (localDateTime: string, minutes: number): string => {
  const [date = "", clock = "00:00"] = localDateTime.split("T");
  const [hour = 0, minute = 0] = clock.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  const carry = Math.floor(total / (24 * 60));
  const rest = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const nextDate = carry === 0 ? date : addLocalDays(date, carry);
  return `${nextDate}T${String(Math.floor(rest / 60)).padStart(2, "0")}:${String(rest % 60).padStart(2, "0")}`;
};

const readTitle = async (
  deps: StudyNudgeActionDeps,
  session: StudySession
): Promise<string> => {
  const plan = await runRepo(
    deps.getLatestStudyPlan({ goalId: session.goalId, status: "active" })
  );
  return (
    plan?.nodes.find((node) => node.id === session.planNodeId)?.title ??
    "这一节课"
  );
};

const applyAction = async (
  deps: StudyNudgeActionDeps,
  input: {
    action: StudyNudgeAction;
    now: Date;
    session: StudySession;
    timezone: string;
  }
): Promise<NudgeActionResult> => {
  const { action, now, session, timezone } = input;
  const nowLocalDateTime = localDateTimeOf(now, timezone);
  const title = await readTitle(deps, session);

  if (action === "start") {
    if (session.status === "planned") {
      await runRepo(
        deps.updateStudySession({
          patch: {
            startedAt: session.startedAt ?? now.toISOString(),
            status: "in_progress",
          },
          sessionId: session.id,
        })
      );
    }
    return {
      ack: "已就绪",
      text: `${title} · 已标记为进行中\n回到 Buni 的 Now 页面提交自检。`,
    };
  }

  if (action === "snooze") {
    const snoozeUntil = plusMinutes(nowLocalDateTime, SNOOZE_MINUTES);
    await runRepo(
      deps.appendEvent(session.profileId, "study.reminder_snoozed", {
        goalId: session.goalId,
        sessionId: session.id,
        snoozeUntil,
      })
    );
    return {
      ack: `${SNOOZE_MINUTES} 分钟后再提醒`,
      text: `${title} · 稍后提醒\n${snoozeUntil.slice(11, 16)} 会再提醒一次。`,
    };
  }

  if (action === "tomorrow") {
    const today = localDateInTimeZone(now, timezone);
    const scheduledFor = `${addLocalDays(today, 1)}T${nextReviewClock(session.scheduledFor)}`;
    await runRepo(
      deps.updateStudySession({
        patch: {
          rescheduledFrom: session.rescheduledFrom ?? session.scheduledFor,
          scheduledFor,
          status: "planned",
        },
        sessionId: session.id,
      })
    );
    return {
      ack: "已改到明晚",
      text: `${title} · 已改到明晚\n${scheduledFor.slice(0, 10)} ${scheduledFor.slice(11, 16)} 再开始。`,
    };
  }

  await runRepo(
    deps.updateStudySession({
      patch: { status: "skipped" },
      sessionId: session.id,
    })
  );
  return {
    ack: "已跳过",
    text: `${title} · 今晚跳过\n明天会重新安排。`,
  };
};

/**
 * Handle a tap on a nudge button. Returns the texts the caller should send
 * back to Telegram (callback ack + rewritten message body).
 */
export const applyStudyNudgeAction = async (
  input: {
    action: StudyNudgeAction;
    now?: Date;
    profileId: string;
    sessionId: string;
  },
  deps: Partial<StudyNudgeActionDeps> = {}
): Promise<NudgeActionResult | null> => {
  const resolved = { ...defaultDeps, ...deps };
  const session = await runRepo(resolved.getStudySession(input.sessionId));
  if (!session || session.profileId !== input.profileId) {
    return null;
  }
  const config = await runRepo(resolved.getStudyGoalConfig(session.goalId));
  if (!config) {
    return null;
  }
  const result = await applyAction(resolved, {
    action: input.action,
    now: input.now ?? new Date(),
    session,
    timezone: config.timezone,
  });
  await runRepo(
    resolved.appendEvent(input.profileId, "study.nudge_acted", {
      action: input.action,
      goalId: session.goalId,
      sessionId: session.id,
    })
  );
  return result;
};

export const readStudyChannels = (config: StudyGoalConfig) => config.channels;

/** Bind a Telegram chat to a study goal, so nudges have somewhere to go. */
export const bindStudyGoalChannel = async (
  input: {
    chatId: string;
    goalId: string;
    profileId: string;
  },
  deps: Partial<StudyNudgeActionDeps> = {}
): Promise<{ bound: boolean; channels: StudyGoalConfig["channels"] }> => {
  const resolved = { ...defaultDeps, ...deps };
  const goal = await runRepo(resolved.getGoal(input.goalId));
  if (!goal || goal.profileId !== input.profileId) {
    return { bound: false, channels: [] };
  }
  const config = await runRepo(resolved.getStudyGoalConfig(input.goalId));
  if (!config) {
    return { bound: false, channels: [] };
  }
  const alias = `study-${input.goalId.slice(-6)}`;
  const exists = config.channels.some(
    (channel) =>
      channel.platform === "telegram" && channel.targetId === input.chatId
  );
  if (exists) {
    return { bound: true, channels: config.channels };
  }
  const channels = [
    ...config.channels,
    {
      platform: "telegram" as const,
      targetAlias: alias,
      targetId: input.chatId,
    },
  ].slice(-4);
  await runRepo(
    resolved.upsertStudyGoalConfig({
      config: { ...config, channels },
      goalId: input.goalId,
      profileId: input.profileId,
    })
  );
  return { bound: true, channels };
};

export type { NudgeActionResult, StudyNudgeActionDeps };
