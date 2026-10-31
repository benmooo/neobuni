import type { StudyActivityDay } from "@neobuni/contracts";

import { META } from "../lesson/styles";
import { dayLabel } from "./chart-tokens";

const WEEKDAY_LABELS = ["一", "", "三", "", "五", "", "日"] as const;

const LEVEL_CLASS = [
  "bg-muted",
  "bg-primary/25",
  "bg-primary/50",
  "bg-primary/80",
] as const;

const levelOf = (minutes: number): 0 | 1 | 2 | 3 => {
  if (minutes <= 0) {
    return 0;
  }
  if (minutes <= 15) {
    return 1;
  }
  if (minutes <= 30) {
    return 2;
  }
  return 3;
};

/** Monday-first weekday index for a `YYYY-MM-DD` local date. */
const weekdayIndex = (date: string): number =>
  (new Date(`${date}T00:00:00`).getDay() + 6) % 7;

const toWeeks = (
  days: StudyActivityDay[]
): Array<Array<StudyActivityDay | null>> => {
  const weeks: Array<Array<StudyActivityDay | null>> = [];
  let current: Array<StudyActivityDay | null> = [];

  for (const day of days) {
    const index = weekdayIndex(day.date);
    if (index === 0 && current.length > 0) {
      weeks.push(current);
      current = [];
    } else if (weeks.length === 0 && current.length === 0) {
      current = Array.from({ length: index }, () => null);
    }
    current.push(day);
  }

  if (current.length > 0) {
    weeks.push([
      ...current,
      ...Array.from({ length: 7 - current.length }, () => null),
    ]);
  }

  return weeks;
};

export function StudyHeatmap({ days }: { days: StudyActivityDay[] }) {
  const weeks = toWeeks(days);
  const activeDays = days.filter((day) => day.completedMinutes > 0).length;
  const totalMinutes = days.reduce((sum, day) => sum + day.completedMinutes, 0);

  if (weeks.length === 0) {
    return <p className="text-muted-foreground text-xs">还没有学习记录。</p>;
  }

  return (
    <div className="space-y-2.5">
      <div className="flex gap-1.5">
        <div className="flex shrink-0 flex-col gap-[3px] pt-px">
          {WEEKDAY_LABELS.map((label, index) => (
            <span
              className="flex h-3.5 items-center text-[0.5625rem] text-muted-foreground leading-none"
              key={`${label}-${index}`}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="flex flex-1 gap-1 overflow-x-auto pb-0.5">
          {weeks.map((week, weekIndex) => (
            <div className="flex shrink-0 flex-col gap-1" key={weekIndex}>
              {week.map((day, dayIndex) =>
                day ? (
                  <span
                    className={`size-3.5 ${LEVEL_CLASS[levelOf(day.completedMinutes)]}`}
                    key={day.date}
                    title={`${day.date} · ${day.completedMinutes} 分钟 · ${day.completedSessions} 节`}
                  />
                ) : (
                  <span
                    className="size-3.5"
                    key={`empty-${weekIndex}-${dayIndex}`}
                  />
                )
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <span className="text-[0.625rem] text-muted-foreground">少</span>
          {LEVEL_CLASS.map((level) => (
            <span className={`size-3 ${level}`} key={level} />
          ))}
          <span className="text-[0.625rem] text-muted-foreground">多</span>
        </div>
        <span className={META}>
          {activeDays} 天 · {Math.round(totalMinutes / 60)} 小时
        </span>
      </div>
      {days.length > 0 && days[0] ? (
        <p className="text-[0.625rem] text-muted-foreground">
          {dayLabel(days[0].date)} 起 · 按计划日统计
        </p>
      ) : null}
    </div>
  );
}
