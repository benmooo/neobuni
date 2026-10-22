import type { EnvironmentalSignal, SignalSet } from "@neobuni/contracts";

import { annotateSignalQuality } from "./signal-policy";

interface LocalTimeParts {
  dayOfWeek: number;
  hour: number;
}

const clamp = (value: number) =>
  Math.min(1, Math.max(0, Math.round(value * 100) / 100));

const getLocalTimeParts = (
  now: string,
  timeZone: string
): LocalTimeParts | null => {
  const date = new Date(now);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? null;
  const hour = Number(
    parts.find((part) => part.type === "hour")?.value ?? "NaN"
  );

  if (!(weekday && Number.isFinite(hour))) {
    return null;
  }

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    dayOfWeek: weekdayMap[weekday] ?? 0,
    hour,
  };
};

const getDayPart = (hour: number) => {
  if (hour <= 5) {
    return "quiet_hours";
  }
  if (hour <= 8) {
    return "early_morning";
  }
  if (hour <= 11) {
    return "morning";
  }
  if (hour <= 17) {
    return "daytime";
  }
  if (hour <= 21) {
    return "evening";
  }
  return "late_evening";
};

const getTimeContextScore = (hour: number, isWeekend: boolean) => {
  if (hour <= 5) {
    return 0.82;
  }
  if (hour <= 8) {
    return 0.58;
  }
  if (hour >= 22) {
    return 0.68;
  }
  if (isWeekend) {
    return 0.44;
  }
  return 0.28;
};

const adaptEnvironmentalSignals = (input: {
  now: string;
  effectiveTimezone: string;
}): SignalSet["environmentalSignals"] => {
  const localTime = getLocalTimeParts(input.now, input.effectiveTimezone);

  if (!localTime) {
    return [];
  }

  const isWeekend = localTime.dayOfWeek === 0 || localTime.dayOfWeek === 6;
  const dayPart = getDayPart(localTime.hour);
  const quietHours = dayPart === "quiet_hours";
  const offHours =
    quietHours || dayPart === "early_morning" || dayPart === "late_evening";

  const signal: EnvironmentalSignal = {
    kind: "time_context",
    score: clamp(getTimeContextScore(localTime.hour, isWeekend)),
    metadata: {
      timezone: input.effectiveTimezone,
      localHour: localTime.hour,
      dayOfWeek: localTime.dayOfWeek,
      isWeekend,
      quietHours,
      offHours,
      dayPart,
    },
  };

  return [annotateSignalQuality(signal)];
};

export { adaptEnvironmentalSignals };
