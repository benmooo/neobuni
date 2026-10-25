import type {
  StudyGoalConfig,
  StudyPlanNode,
  StudySession,
  StudySessionStatus,
} from "@neobuni/contracts";

import {
  addLocalDays,
  addMinutesToClock,
  compareLocalDateTime,
  dayOfWeek,
  localDateOf,
  toLocalDateTime,
} from "./date";
import { orderStudyLessons } from "./plan";

const BREAK_MINUTES = 5;

const OCCUPYING_SESSION_STATUSES = new Set<StudySessionStatus>([
  "planned",
  "in_progress",
  "completed",
]);

interface PlannedStudySession {
  durationMinutes: number;
  localDate: string;
  planNodeId: string;
  scheduledFor: string;
  timezone: string;
}

interface ScheduleStudySessionsInput {
  config: StudyGoalConfig;
  days: number;
  existingSessions?: Pick<StudySession, "planNodeId" | "status">[];
  nodes: StudyPlanNode[];
  startDate: string;
}

interface ScheduleStudySessionsResult {
  sessions: PlannedStudySession[];
  unscheduledLessonIds: string[];
}

const clockToMinutes = (clock: string): number => {
  const [hours = 0, minutes = 0] = clock.split(":").map(Number);
  return hours * 60 + minutes;
};

const scheduleStudySessions = (
  input: ScheduleStudySessionsInput
): ScheduleStudySessionsResult => {
  const lessons = orderStudyLessons(input.nodes);
  const occupied = new Set(
    (input.existingSessions ?? [])
      .filter((session) => OCCUPYING_SESSION_STATUSES.has(session.status))
      .map((session) => session.planNodeId)
  );
  const remaining = lessons.filter((lesson) => !occupied.has(lesson.id));
  const completedOrScheduled = new Set(occupied);
  const scheduled: PlannedStudySession[] = [];
  const unscheduled: string[] = [];
  const windowEndMinutes = clockToMinutes(input.config.studyWindow.end);

  for (let dayIndex = 0; dayIndex < input.days; dayIndex += 1) {
    if (remaining.length === 0) {
      break;
    }
    const localDate = addLocalDays(input.startDate, dayIndex);
    if (input.config.restDays.includes(dayOfWeek(localDate))) {
      continue;
    }

    let budget = input.config.dailyMinutes;
    let offsetMinutes = 0;
    let placedToday = 0;

    for (const lesson of remaining) {
      if (completedOrScheduled.has(lesson.id)) {
        continue;
      }
      const prerequisitesReady = lesson.prerequisites.every(
        (prerequisite) =>
          completedOrScheduled.has(prerequisite) ||
          scheduled.some((session) => session.planNodeId === prerequisite)
      );
      if (!prerequisitesReady) {
        continue;
      }
      if (lesson.estimatedMinutes > budget) {
        continue;
      }

      const startClock = addMinutesToClock(
        input.config.studyWindow.start,
        offsetMinutes
      );
      const startMinutes = clockToMinutes(startClock);
      if (startMinutes + lesson.estimatedMinutes > windowEndMinutes) {
        continue;
      }

      scheduled.push({
        durationMinutes: lesson.estimatedMinutes,
        localDate,
        planNodeId: lesson.id,
        scheduledFor: toLocalDateTime(localDate, startClock),
        timezone: input.config.timezone,
      });
      completedOrScheduled.add(lesson.id);
      budget -= lesson.estimatedMinutes;
      offsetMinutes += lesson.estimatedMinutes + BREAK_MINUTES;
      placedToday += 1;
    }

    if (placedToday === 0) {
    }
  }

  for (const lesson of remaining) {
    if (!completedOrScheduled.has(lesson.id)) {
      unscheduled.push(lesson.id);
    }
  }

  return { sessions: scheduled, unscheduledLessonIds: unscheduled };
};

const compareSessions = (left: StudySession, right: StudySession): number =>
  compareLocalDateTime(left.scheduledFor, right.scheduledFor) ||
  left.createdAt.localeCompare(right.createdAt);

const isStudySessionDue = (
  session: Pick<StudySession, "scheduledFor" | "status">,
  nowLocalDateTime: string
): boolean =>
  (session.status === "planned" || session.status === "in_progress") &&
  compareLocalDateTime(session.scheduledFor, nowLocalDateTime) <= 0;

const selectNextStudySession = (input: {
  nowLocalDateTime: string;
  sessions: StudySession[];
}): StudySession | null => {
  const actionable = input.sessions
    .filter(
      (session) =>
        session.status === "planned" || session.status === "in_progress"
    )
    .sort(compareSessions);
  const due = actionable.find((session) =>
    isStudySessionDue(session, input.nowLocalDateTime)
  );
  return due ?? actionable[0] ?? null;
};

const groupSessionsByLocalDate = (
  sessions: StudySession[]
): Map<string, StudySession[]> => {
  const grouped = new Map<string, StudySession[]>();
  for (const session of sessions) {
    const localDate = localDateOf(session.scheduledFor);
    const entries = grouped.get(localDate) ?? [];
    entries.push(session);
    grouped.set(localDate, entries);
  }
  return grouped;
};

export type {
  PlannedStudySession,
  ScheduleStudySessionsInput,
  ScheduleStudySessionsResult,
};
export {
  compareSessions,
  groupSessionsByLocalDate,
  isStudySessionDue,
  scheduleStudySessions,
  selectNextStudySession,
};
