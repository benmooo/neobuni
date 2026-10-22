import type {
  ScheduleSignal,
  ScheduleSignalInput,
  SignalSet,
} from "@neobuni/contracts";

import { annotateSignalQuality } from "./signal-policy";

const HOURS_24_MS = 24 * 60 * 60 * 1000;
const HOURS_3_MS = 3 * 60 * 60 * 1000;
const MINUTES_15_MS = 15 * 60 * 1000;

const round = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number) => Math.min(1, Math.max(0, round(value)));
const unique = <T>(values: T[]) => Array.from(new Set(values));

const toScheduleIds = (schedules: Array<{ id: string }>) =>
  unique(schedules.map((schedule) => schedule.id)).slice(0, 4);

const withTimedSchedules = (schedules: ScheduleSignalInput[]) =>
  schedules
    .filter(
      (schedule) => schedule.status === "active" && schedule.triggerAt !== null
    )
    .map((schedule) => ({
      ...schedule,
      triggerAtMs: Date.parse(schedule.triggerAt as string),
    }))
    .sort((left, right) => left.triggerAtMs - right.triggerAtMs)
    .filter((schedule) => Number.isFinite(schedule.triggerAtMs));

const computeUpcomingCommitmentScore = (
  nearestUpcomingHours: number,
  count24h: number
) => {
  const urgency = Math.max(0, 1 - Math.min(nearestUpcomingHours, 24) / 24);
  const countBoost = Math.min(0.18, Math.max(0, count24h - 1) * 0.06);
  return clamp(0.32 + urgency * 0.36 + countBoost);
};

const computeTimePressureScore = (
  nearestHours: number,
  imminentCount: number
) => {
  const urgency = Math.max(0, 1 - Math.min(nearestHours, 3) / 3);
  const countBoost = Math.min(0.14, Math.max(0, imminentCount - 1) * 0.07);
  return clamp(0.56 + urgency * 0.24 + countBoost);
};

const computeMissedCommitmentScore = (
  mostOverdueHours: number,
  overdueCount: number
) => {
  const tardiness = Math.min(mostOverdueHours, 24) / 24;
  const countBoost = Math.min(0.18, Math.max(0, overdueCount - 1) * 0.09);
  return clamp(0.52 + tardiness * 0.18 + countBoost);
};

const computeScheduleDisruptionScore = (input: {
  overdueCount: number;
  imminentCount: number;
  nearestUpcomingHours: number | null;
  mostOverdueHours: number;
}) => {
  const overdueFactor =
    input.overdueCount > 0
      ? 0.22 + Math.min(0.16, input.overdueCount * 0.08)
      : 0;
  const imminentFactor =
    input.imminentCount >= 2
      ? 0.16 + Math.min(0.12, (input.imminentCount - 1) * 0.06)
      : 0;
  const pressureFactor =
    input.nearestUpcomingHours === null
      ? 0
      : Math.max(0, 1 - Math.min(input.nearestUpcomingHours, 3) / 3) * 0.12;
  const overdueTardinessFactor =
    input.overdueCount > 0
      ? (Math.min(input.mostOverdueHours, 24) / 24) * 0.12
      : 0;

  return clamp(
    0.34 +
      overdueFactor +
      imminentFactor +
      pressureFactor +
      overdueTardinessFactor
  );
};

const adaptScheduleSignals = (input: {
  schedules: ScheduleSignalInput[];
  now: string;
}): SignalSet["scheduleSignals"] => {
  const nowMs = Date.parse(input.now);

  if (!Number.isFinite(nowMs)) {
    return [];
  }

  const schedules = withTimedSchedules(input.schedules);
  const upcoming = schedules.filter(
    (schedule) => schedule.triggerAtMs >= nowMs
  );
  const upcomingWithin24h = upcoming.filter(
    (schedule) => schedule.triggerAtMs - nowMs <= HOURS_24_MS
  );
  const imminent = upcoming.filter(
    (schedule) => schedule.triggerAtMs - nowMs <= HOURS_3_MS
  );
  const overdue = schedules.filter(
    (schedule) => nowMs - schedule.triggerAtMs >= MINUTES_15_MS
  );

  const nearestUpcomingHours =
    upcomingWithin24h.length > 0
      ? Math.min(
          ...upcomingWithin24h.map(
            (schedule) => (schedule.triggerAtMs - nowMs) / 3_600_000
          )
        )
      : null;

  const signals: ScheduleSignal[] = [];

  const nearestUpcomingSchedule = upcomingWithin24h[0];

  if (nearestUpcomingSchedule) {
    const nearestSchedule = nearestUpcomingSchedule;
    signals.push({
      kind: "upcoming_commitment",
      score:
        nearestUpcomingHours === null
          ? 0.4
          : computeUpcomingCommitmentScore(
              nearestUpcomingHours,
              upcomingWithin24h.length
            ),
      scheduleIds: toScheduleIds(upcomingWithin24h),
      metadata: {
        nearestScheduleId: nearestSchedule?.id ?? null,
        nearestScheduleTitle: nearestSchedule?.title ?? null,
        nearestUpcomingHours:
          nearestUpcomingHours === null ? null : round(nearestUpcomingHours),
        upcomingCount24h: upcomingWithin24h.length,
        activeTimedCount: schedules.length,
      },
    });
  }

  const nearestImminentSchedule = imminent[0];

  if (nearestImminentSchedule) {
    const nearestSchedule = nearestImminentSchedule;
    const nearestHours = (nearestSchedule.triggerAtMs - nowMs) / 3_600_000;

    signals.push({
      kind: "time_pressure",
      score: computeTimePressureScore(nearestHours, imminent.length),
      scheduleIds: toScheduleIds(imminent),
      metadata: {
        nearestScheduleId: nearestSchedule.id,
        nearestScheduleTitle: nearestSchedule.title,
        nearestUpcomingHours: round(nearestHours),
        imminentCount: imminent.length,
        activeTimedCount: schedules.length,
      },
    });
  }

  if (overdue.length > 0) {
    const mostOverdueHours = Math.max(
      ...overdue.map((schedule) => (nowMs - schedule.triggerAtMs) / 3_600_000)
    );

    signals.push({
      kind: "missed_commitment",
      score: computeMissedCommitmentScore(mostOverdueHours, overdue.length),
      scheduleIds: toScheduleIds(overdue),
      metadata: {
        overdueCount: overdue.length,
        mostOverdueHours: round(mostOverdueHours),
        oldestOverdueScheduleId: overdue[0]?.id ?? null,
        oldestOverdueScheduleTitle: overdue[0]?.title ?? null,
      },
    });
  }

  if (overdue.length > 0 || imminent.length >= 2) {
    signals.push({
      kind: "schedule_disruption",
      score: computeScheduleDisruptionScore({
        overdueCount: overdue.length,
        imminentCount: imminent.length,
        nearestUpcomingHours,
        mostOverdueHours:
          overdue.length > 0
            ? Math.max(
                ...overdue.map(
                  (schedule) => (nowMs - schedule.triggerAtMs) / 3_600_000
                )
              )
            : 0,
      }),
      scheduleIds: toScheduleIds([...overdue, ...imminent]),
      metadata: {
        overdueCount: overdue.length,
        imminentCount: imminent.length,
        nearestUpcomingHours:
          nearestUpcomingHours === null ? null : round(nearestUpcomingHours),
        activeTimedCount: schedules.length,
      },
    });
  }

  return signals.map(annotateSignalQuality);
};

export { adaptScheduleSignals };
