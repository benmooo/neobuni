import type {
  StudyGoalConfig,
  StudyNudgeKind,
  StudyNudgeSettings,
  StudyPlanNode,
  StudySession,
} from "@neobuni/contracts";
import { localDateTimeToEpoch } from "@neobuni/core";

export const PRE_WINDOW_MINUTES = 30;
export const WRAP_UP_MINUTES = 15;
export const STREAK_BREAK_DAYS = 2;
export const SNOOZE_MINUTES = 30;
export const MAX_UPCOMING_IN_NUDGE = 3;

export type StudyNudgeAction = "skip" | "snooze" | "start" | "tomorrow";

export interface StudyNudge {
  buttons: ReadonlyArray<{ action: StudyNudgeAction; label: string }>;
  dedupeKey: string;
  kind: StudyNudgeKind;
  planNodeId: string | null;
  scheduledFor: string | null;
  sessionId: string | null;
  sessionIds: string[];
  text: string;
}

export interface StudyNudgeEvent {
  createdAt: string;
  payload: Record<string, unknown>;
  type: string;
}

export interface StudyNudgeInput {
  config: StudyGoalConfig;
  events: StudyNudgeEvent[];
  leadMinutes: number;
  localDate: string;
  nodes: StudyPlanNode[];
  nowLocalDateTime: string;
  sessions: StudySession[];
  settings: StudyNudgeSettings;
}

export const DEFAULT_NUDGE_SETTINGS: StudyNudgeSettings = {
  dailyPlan: true,
  sessionDue: true,
  streakRecovery: true,
  reviewDue: true,
  wrapUp: true,
};

export const readNudgeSettings = (
  config: StudyGoalConfig | null | undefined
): StudyNudgeSettings => ({ ...DEFAULT_NUDGE_SETTINGS, ...config?.nudges });

export const clockToMinutes = (clock: string): number => {
  const [hour, minute] = clock.split(":");
  return Number(hour) * 60 + Number(minute);
};

const clockOf = (localDateTime: string): string => localDateTime.slice(11, 16);

const dateOf = (localDateTime: string): string => localDateTime.slice(0, 10);

const minutesUntil = (target: string, from: string): number =>
  (localDateTimeToEpoch(target) - localDateTimeToEpoch(from)) / 60_000;

const minutesSince = (from: string, to: string): number =>
  (localDateTimeToEpoch(to) - localDateTimeToEpoch(from)) / 60_000;

const formatClock = (clock: string): string =>
  clock.length >= 5 ? clock.slice(0, 5) : clock;

export const nudgeSessionKey = (
  sessionId: string,
  scheduledFor: string
): string => `session_due:${sessionId}:${scheduledFor}`;

/** Dedupe keys already delivered for this profile. */
export const deliveredNudgeKeys = (events: StudyNudgeEvent[]): Set<string> => {
  const keys = new Set<string>();
  for (const event of events) {
    if (event.type === "study.nudge_sent") {
      const key = event.payload.dedupeKey;
      if (typeof key === "string") {
        keys.add(key);
      }
      continue;
    }
    if (event.type === "study.reminder_sent") {
      const sessionId = event.payload.sessionId;
      const scheduledFor = event.payload.scheduledFor;
      if (typeof sessionId === "string" && typeof scheduledFor === "string") {
        keys.add(nudgeSessionKey(sessionId, scheduledFor));
      }
    }
  }
  return keys;
};

/**
 * Per-day outbound budget shared by nudges and scout digests: counts legacy
 * reminders, new nudges, and material digests.
 */
const BUDGET_EVENT_TYPES = new Set([
  "study.nudge_sent",
  "study.reminder_sent",
  "study.scout_sent",
]);
export const countNudgesOnDate = (
  events: StudyNudgeEvent[],
  localDate: string,
  timezone: string
): number => {
  const inZone = (iso: string): string => {
    // createdAt is an ISO instant; compare the local date in the goal timezone.
    const parts = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone: timezone,
      year: "numeric",
    }).format(new Date(iso));
    return parts;
  };
  return events.filter(
    (event) =>
      BUDGET_EVENT_TYPES.has(event.type) &&
      inZone(event.createdAt) === localDate
  ).length;
};

export const activeSnoozeUntil = (
  events: StudyNudgeEvent[],
  sessionId: string,
  nowLocalDateTime: string
): string | null => {
  let latest: string | null = null;
  for (const event of events) {
    if (event.type !== "study.reminder_snoozed") {
      continue;
    }
    if (event.payload.sessionId !== sessionId) {
      continue;
    }
    const until = event.payload.snoozeUntil;
    if (typeof until !== "string" || until <= nowLocalDateTime) {
      continue;
    }
    if (latest === null || until > latest) {
      latest = until;
    }
  }
  return latest;
};

const nodeTitle = (node: StudyPlanNode | undefined, fallback: string): string =>
  node?.title ?? fallback;

const lessonLine = (
  node: StudyPlanNode | undefined,
  session: StudySession,
  index: number
): string =>
  `${index + 1}. ${nodeTitle(node, "学习内容")} · ${session.durationMinutes} 分钟`;

const renderDailyPlan = (input: {
  config: StudyGoalConfig;
  entries: { node: StudyPlanNode | undefined; session: StudySession }[];
  totalMinutes: number;
}): string => {
  const { config, entries, totalMinutes } = input;
  const clock = formatClock(config.studyWindow.start);
  const lines = entries.map((entry, index) =>
    lessonLine(entry.node, entry.session, index)
  );
  return [
    `今天 ${clock} 开始 · ${entries.length} 节 · ${totalMinutes} 分钟`,
    ...lines,
    "回复按钮即可开始，或稍后再说。",
  ].join("\n");
};

const renderSessionDue = (
  node: StudyPlanNode | undefined,
  session: StudySession
): string => {
  const clock = formatClock(session.scheduledFor.slice(11, 16));
  return [
    `${clock} · ${nodeTitle(node, "下一节课")}`,
    `${session.durationMinutes} 分钟${node?.paper ? ` · ${paperLabel(node.paper)}` : ""}`,
    "到点开始，或改到明晚。",
  ].join("\n");
};

const renderStreakRecovery = (input: {
  config: StudyGoalConfig;
  entries: { node: StudyPlanNode | undefined; session: StudySession }[];
  missedDays: number;
}): string => {
  const first = input.entries[0];
  const minutes = first ? Math.min(first.session.durationMinutes, 20) : 20;
  return [
    `已经 ${input.missedDays} 天没有完成学习。`,
    `今晚 ${minutes} 分钟就够${first ? `：${nodeTitle(first.node, "下一节课")}` : ""}。`,
    "从最小的一步开始。",
  ].join("\n");
};

const renderReviewDue = (input: {
  entries: { node: StudyPlanNode | undefined; session: StudySession }[];
  reviewCount: number;
}): string => {
  const first = input.entries[0];
  return [
    `复习到期 · ${input.reviewCount} 节需要回看`,
    first ? `先看：${nodeTitle(first.node, "上一次的课")}` : null,
    "5 分钟自检，答 2 道就够。",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
};

const renderWrapUp = (input: {
  doneMinutes: number;
  doneSessions: number;
  plannedSessions: number;
  totalMinutes: number;
}): string => {
  const remaining = Math.max(0, input.plannedSessions - input.doneSessions);
  return [
    `今天完成 ${input.doneSessions}/${input.plannedSessions} 节 · ${input.doneMinutes} 分钟。`,
    remaining > 0
      ? `还差 ${remaining} 节，${input.totalMinutes} 分钟能补完。`
      : "今天的安排已经完成。",
    remaining > 0 ? "补一节，或今天到此为止。" : "早点休息。",
  ].join("\n");
};

const paperLabel = (paper: StudyPlanNode["paper"]): string => {
  switch (paper) {
    case "comprehensive":
      return "综合知识";
    case "case":
      return "案例分析";
    case "essay":
      return "论文";
    default:
      return "共享";
  }
};

const sessionButtons = (): StudyNudge["buttons"] => [
  { action: "start", label: "开始学习" },
  { action: "snooze", label: "30 分钟后" },
  { action: "tomorrow", label: "改到明晚" },
  { action: "skip", label: "今晚跳过" },
];

const dayPlanButtons = (): StudyNudge["buttons"] => [
  { action: "start", label: "开始第一节" },
  { action: "tomorrow", label: "改到明晚" },
  { action: "skip", label: "今晚跳过" },
];

const wrapUpButtons = (): StudyNudge["buttons"] => [
  { action: "start", label: "再补一节" },
  { action: "snooze", label: "30 分钟后" },
  { action: "skip", label: "今天到此为止" },
];

const minutesOfDay = (localDateTime: string): number =>
  clockToMinutes(clockOf(localDateTime));

const withinMinutesOfDay = (
  localDateTime: string,
  startBucket: number,
  endBucket: number
): boolean => {
  const value = minutesOfDay(localDateTime);
  return value >= startBucket && value < endBucket;
};

const isReviewSession = (
  session: StudySession,
  sessions: StudySession[]
): boolean =>
  sessions.some(
    (other) =>
      other.id !== session.id &&
      other.planNodeId === session.planNodeId &&
      other.status === "completed" &&
      other.scheduledFor < session.scheduledFor
  );

const missedStreakDays = (input: {
  localDate: string;
  sessions: StudySession[];
}): number => {
  const pastByDate = new Map<string, StudySession[]>();
  for (const session of input.sessions) {
    const date = dateOf(session.scheduledFor);
    if (date >= input.localDate) {
      continue;
    }
    const bucket = pastByDate.get(date) ?? [];
    bucket.push(session);
    pastByDate.set(date, bucket);
  }
  const dates = [...pastByDate.keys()].sort();
  let streak = 0;
  for (let index = dates.length - 1; index >= 0; index -= 1) {
    const date = dates[index];
    if (!date) {
      break;
    }
    const bucket = pastByDate.get(date) ?? [];
    const missed = bucket.every(
      (session) =>
        session.status !== "completed" && session.status !== "in_progress"
    );
    if (!missed) {
      break;
    }
    streak += 1;
  }
  return streak;
};

/**
 * Build the nudges that are due right now for one goal.
 * Pure: the worker decides how to deliver them.
 */
export const buildStudyNudges = (input: StudyNudgeInput): StudyNudge[] => {
  const {
    config,
    events,
    leadMinutes,
    localDate,
    nodes,
    nowLocalDateTime,
    sessions,
    settings,
  } = input;
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const delivered = deliveredNudgeKeys(events);
  const todaySessions = sessions
    .filter((session) => dateOf(session.scheduledFor) === localDate)
    .sort((left, right) => left.scheduledFor.localeCompare(right.scheduledFor));
  const pendingToday = todaySessions.filter(
    (session) =>
      session.status === "planned" || session.status === "in_progress"
  );

  const candidates: StudyNudge[] = [];

  const windowStart = clockToMinutes(config.studyWindow.start);
  const windowEnd = clockToMinutes(config.studyWindow.end);

  const planSessionIds: string[] = [];

  if (
    withinMinutesOfDay(
      nowLocalDateTime,
      windowStart - PRE_WINDOW_MINUTES,
      windowStart
    )
  ) {
    const entries = pendingToday
      .slice(0, MAX_UPCOMING_IN_NUDGE)
      .map((session) => ({ node: nodeById.get(session.planNodeId), session }));
    const firstSession = entries[0]?.session ?? null;
    const totalMinutes = entries.reduce(
      (sum, entry) => sum + entry.session.durationMinutes,
      0
    );
    const reviewEntries = entries.filter((entry) =>
      isReviewSession(entry.session, sessions)
    );
    const streak = missedStreakDays({ localDate, sessions });
    planSessionIds.push(...entries.map((entry) => entry.session.id));

    if (entries.length > 0 && firstSession) {
      if (settings.streakRecovery && streak >= STREAK_BREAK_DAYS) {
        const key = `streak_recovery:${localDate}`;
        if (!delivered.has(key)) {
          candidates.push({
            buttons: [
              { action: "start", label: "开始 20 分钟" },
              { action: "tomorrow", label: "改到明晚" },
            ],
            dedupeKey: key,
            kind: "streak_recovery",
            planNodeId: firstSession.planNodeId,
            scheduledFor: firstSession.scheduledFor,
            sessionId: firstSession.id,
            sessionIds: planSessionIds,
            text: renderStreakRecovery({
              config,
              entries,
              missedDays: streak,
            }),
          });
        }
      } else if (settings.reviewDue && reviewEntries.length > 0) {
        const reviewEntry = reviewEntries[0];
        if (!reviewEntry) {
          return candidates;
        }
        const reviewSession = reviewEntry.session;
        const key = `review_due:${localDate}`;
        if (!delivered.has(key)) {
          candidates.push({
            buttons: [
              { action: "start", label: "开始复习" },
              { action: "snooze", label: "30 分钟后" },
              { action: "tomorrow", label: "改到明晚" },
            ],
            dedupeKey: key,
            kind: "review_due",
            planNodeId: reviewSession.planNodeId,
            scheduledFor: reviewSession.scheduledFor,
            sessionId: reviewSession.id,
            sessionIds: reviewEntries.map((entry) => entry.session.id),
            text: renderReviewDue({
              entries: reviewEntries,
              reviewCount: reviewEntries.length,
            }),
          });
        }
      } else if (settings.dailyPlan) {
        const key = `daily_plan:${localDate}`;
        if (!delivered.has(key)) {
          candidates.push({
            buttons: dayPlanButtons(),
            dedupeKey: key,
            kind: "daily_plan",
            planNodeId: firstSession.planNodeId,
            scheduledFor: firstSession.scheduledFor,
            sessionId: firstSession.id,
            sessionIds: planSessionIds,
            text: renderDailyPlan({ config, entries, totalMinutes }),
          });
        }
      }
    }
  }

  const plannedSessionIds = new Set(planSessionIds);
  const planDeliveredToday = delivered.has(`daily_plan:${localDate}`);

  if (settings.sessionDue) {
    for (const session of sessions) {
      if (session.status !== "planned") {
        continue;
      }
      const delta = minutesUntil(session.scheduledFor, nowLocalDateTime);
      if (delta > leadMinutes || delta < -24 * 60) {
        continue;
      }
      const key = nudgeSessionKey(session.id, session.scheduledFor);
      if (delivered.has(key)) {
        continue;
      }
      // A pending day-plan nudge (or the one already sent today) covers these.
      if (plannedSessionIds.has(session.id) || planDeliveredToday) {
        continue;
      }
      if (activeSnoozeUntil(events, session.id, nowLocalDateTime)) {
        continue;
      }
      candidates.push({
        buttons: sessionButtons(),
        dedupeKey: key,
        kind: "session_due",
        planNodeId: session.planNodeId,
        scheduledFor: session.scheduledFor,
        sessionId: session.id,
        sessionIds: [session.id],
        text: renderSessionDue(nodeById.get(session.planNodeId), session),
      });
    }
  }

  if (
    settings.wrapUp &&
    withinMinutesOfDay(nowLocalDateTime, windowEnd - WRAP_UP_MINUTES, windowEnd)
  ) {
    const key = `wrap_up:${localDate}`;
    const completed = todaySessions.filter(
      (session) => session.status === "completed"
    );
    const backlog = pendingToday;
    const first = backlog[0] ?? null;
    if (!delivered.has(key) && completed.length > 0) {
      candidates.push({
        buttons: first ? wrapUpButtons() : [],
        dedupeKey: key,
        kind: "wrap_up",
        planNodeId: first?.planNodeId ?? null,
        scheduledFor: first?.scheduledFor ?? null,
        sessionId: first?.id ?? null,
        sessionIds: backlog.map((session) => session.id),
        text: renderWrapUp({
          doneMinutes: completed.reduce(
            (sum, session) =>
              sum + (session.actualMinutes ?? session.durationMinutes),
            0
          ),
          doneSessions: completed.length,
          plannedSessions: todaySessions.length,
          totalMinutes: backlog.reduce(
            (sum, session) => sum + session.durationMinutes,
            0
          ),
        }),
      });
    }
  }

  const priority: Record<StudyNudgeKind, number> = {
    session_due: 0,
    wrap_up: 1,
    streak_recovery: 2,
    review_due: 3,
    daily_plan: 4,
  };
  return candidates.sort(
    (left, right) => priority[left.kind] - priority[right.kind]
  );
};

/** Preview used by the settings screen: does not depend on the clock. */
export const previewStudyNudge = (input: {
  config: StudyGoalConfig;
  nodes: StudyPlanNode[];
  sessions: StudySession[];
}): StudyNudge => {
  const nodeById = new Map(input.nodes.map((node) => [node.id, node] as const));
  const upcoming = input.sessions
    .filter((session) => session.status === "planned")
    .sort((left, right) => left.scheduledFor.localeCompare(right.scheduledFor))
    .slice(0, MAX_UPCOMING_IN_NUDGE);
  const first = upcoming[0];
  if (!first) {
    return {
      buttons: [],
      dedupeKey: "preview",
      kind: "daily_plan",
      planNodeId: null,
      scheduledFor: null,
      sessionId: null,
      sessionIds: [],
      text: "还没有排课。生成计划后，Buni 会在学习时段前提醒你。",
    };
  }
  const entries = upcoming.map((session) => ({
    node: nodeById.get(session.planNodeId),
    session,
  }));
  return {
    buttons: dayPlanButtons(),
    dedupeKey: "preview",
    kind: "daily_plan",
    planNodeId: first.planNodeId,
    scheduledFor: first.scheduledFor,
    sessionId: first.id,
    sessionIds: upcoming.map((session) => session.id),
    text: renderDailyPlan({
      config: input.config,
      entries,
      totalMinutes: upcoming.reduce(
        (sum, session) => sum + session.durationMinutes,
        0
      ),
    }),
  };
};

export { clockOf, dateOf, formatClock, minutesSince };
