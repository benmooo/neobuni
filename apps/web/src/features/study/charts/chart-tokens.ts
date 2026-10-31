/** Recharts animations stay off for users who asked for reduced motion. */
const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const animationsEnabled = (): boolean => !prefersReducedMotion();

/** `2027-03-09` → `3/9` */
const dayLabel = (date: string): string => {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
};

const asDayLabel = (value: unknown): string =>
  typeof value === "string" ? dayLabel(value) : String(value);

const asMinutes = (value: unknown): string => `${Number(value)} 分钟`;

const CHART_GRID_PROPS = {
  stroke: "var(--border)",
  strokeDasharray: "2 4",
  vertical: false,
} as const;

const AXIS_PROPS = {
  axisLine: false,
  tickLine: false,
  tick: { fontSize: 10 },
  tickMargin: 6,
} as const;

/** Shared card chrome so every study chart reads as one family. */
const CHART_CARD = "gap-0 py-0";
const CHART_CARD_HEADER =
  "flex items-center justify-between border-b px-4 py-3";
const CHART_CARD_BODY = "px-4 py-3";
const CHART_CARD_FOOTER = "border-t px-4 py-2.5 text-muted-foreground text-xs";

export {
  AXIS_PROPS,
  animationsEnabled,
  asDayLabel,
  asMinutes,
  CHART_CARD,
  CHART_CARD_BODY,
  CHART_CARD_FOOTER,
  CHART_CARD_HEADER,
  CHART_GRID_PROPS,
  dayLabel,
};
