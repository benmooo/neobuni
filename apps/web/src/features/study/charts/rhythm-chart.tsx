import type { StudyActivityDay } from "@neobuni/contracts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@neobuni/ui/components/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  AXIS_PROPS,
  animationsEnabled,
  asDayLabel,
  asMinutes,
  CHART_GRID_PROPS,
} from "./chart-tokens";
import { StudyChartEmpty } from "./study-chart-card";

const rhythmConfig = {
  planned: { label: "计划", color: "var(--chart-2)" },
  done: { label: "完成", color: "var(--primary)" },
} satisfies ChartConfig;

interface RhythmChartProps {
  compact?: boolean;
  days: StudyActivityDay[];
}

const tooltipFormatter = (value: unknown, name: unknown) => (
  <span className="flex w-full items-center justify-between gap-3">
    <span className="text-muted-foreground">{String(name)}</span>
    <span className="font-heading tabular-nums">{asMinutes(value)}</span>
  </span>
);

export function RhythmChart({ compact = false, days }: RhythmChartProps) {
  const isIdle = days.every(
    (day) => day.plannedMinutes === 0 && day.completedMinutes === 0
  );

  if (isIdle) {
    return (
      <StudyChartEmpty
        height={compact ? "h-28" : "h-36"}
        label="这段时间还没有学习记录"
      />
    );
  }

  return (
    <ChartContainer
      className={compact ? "h-28 w-full" : "h-36 w-full"}
      config={rhythmConfig}
    >
      <BarChart
        accessibilityLayer
        barCategoryGap="18%"
        barGap={1}
        data={days}
        margin={{ bottom: 0, left: 0, right: 0, top: 2 }}
      >
        <CartesianGrid {...CHART_GRID_PROPS} />
        <XAxis
          {...AXIS_PROPS}
          dataKey="date"
          interval={compact ? 2 : 1}
          tickFormatter={asDayLabel}
        />
        <YAxis hide />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={tooltipFormatter}
              labelFormatter={asDayLabel}
            />
          }
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
        />
        <Bar
          dataKey="planned"
          fill="var(--color-planned)"
          fillOpacity={0.4}
          isAnimationActive={animationsEnabled()}
        />
        <Bar
          dataKey="done"
          fill="var(--color-done)"
          isAnimationActive={animationsEnabled()}
        />
      </BarChart>
    </ChartContainer>
  );
}
