import type { StudyActivityDay } from "@neobuni/contracts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@neobuni/ui/components/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import {
  AXIS_PROPS,
  animationsEnabled,
  asDayLabel,
  asMinutes,
  CHART_GRID_PROPS,
} from "./chart-tokens";
import { StudyChartEmpty } from "./study-chart-card";

const workloadConfig = {
  planned: { label: "排课", color: "var(--chart-3)" },
  overload: { label: "超出上限", color: "var(--destructive)" },
} satisfies ChartConfig;

interface WorkloadChartProps {
  dailyMinutes: number;
  days: StudyActivityDay[];
}

const tooltipFormatter = (value: unknown) => (
  <span className="flex w-full items-center justify-between gap-3">
    <span className="text-muted-foreground">排课</span>
    <span className="font-heading tabular-nums">{asMinutes(value)}</span>
  </span>
);

export function WorkloadChart({ dailyMinutes, days }: WorkloadChartProps) {
  const isIdle = days.every((day) => day.plannedMinutes === 0);

  if (isIdle) {
    return <StudyChartEmpty height="h-40" label="未来两周还没有排课" />;
  }

  return (
    <ChartContainer className="h-40 w-full" config={workloadConfig}>
      <BarChart
        accessibilityLayer
        barCategoryGap="22%"
        data={days}
        margin={{ bottom: 0, left: 0, right: 0, top: 8 }}
      >
        <CartesianGrid {...CHART_GRID_PROPS} />
        <XAxis
          {...AXIS_PROPS}
          dataKey="date"
          interval={1}
          tickFormatter={asDayLabel}
        />
        <YAxis hide />
        <ReferenceLine
          label={{
            fill: "var(--muted-foreground)",
            fontSize: 9,
            position: "insideTopRight",
            value: `每日上限 ${dailyMinutes}m`,
          }}
          stroke="var(--muted-foreground)"
          strokeDasharray="3 3"
          y={dailyMinutes}
        />
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
          dataKey="plannedMinutes"
          isAnimationActive={animationsEnabled()}
          name="planned"
        >
          {days.map((day) => (
            <Cell
              fill={
                day.plannedMinutes > dailyMinutes
                  ? "var(--color-overload)"
                  : "var(--color-planned)"
              }
              key={day.date}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
