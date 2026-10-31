import type { StudyMastery } from "@neobuni/contracts";

type MasteryBand = "untouched" | "studied" | "low" | "mid" | "high";

const BAND_LABELS: Record<MasteryBand, string> = {
  untouched: "未学",
  studied: "已学",
  low: "<60%",
  mid: "60–80%",
  high: "≥80%",
};

const BAND_DOTS: Record<MasteryBand, string> = {
  untouched: "bg-muted-foreground/25",
  studied: "bg-sky-500",
  low: "bg-red-500",
  mid: "bg-amber-500",
  high: "bg-emerald-500",
};

const BAND_FILLS: Record<MasteryBand, string> = {
  untouched: "bg-muted-foreground/20",
  studied: "bg-sky-500/60",
  low: "bg-red-500/70",
  mid: "bg-amber-500/80",
  high: "bg-emerald-500",
};

const bandOf = (
  mastery: StudyMastery | undefined,
  completed: boolean
): MasteryBand => {
  if (mastery && mastery.score >= 0.8) {
    return "high";
  }
  if (mastery && mastery.score >= 0.6) {
    return "mid";
  }
  if (mastery && mastery.score > 0) {
    return "low";
  }
  return completed ? "studied" : "untouched";
};

/** Dot color for a single lesson, shared by the plan tree and the distribution bar. */
const masteryDotClass = (
  mastery: StudyMastery | undefined,
  completed: boolean
): string => BAND_DOTS[bandOf(mastery, completed)];

export type { MasteryBand };
export { BAND_DOTS, BAND_FILLS, BAND_LABELS, bandOf, masteryDotClass };
