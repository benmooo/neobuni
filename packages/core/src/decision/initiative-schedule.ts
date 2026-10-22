import type { Goal } from "@neobuni/contracts";

const isGoalReviewDue = (input: {
  goal: Goal;
  lastDecisionAt: string | null;
  nowIso: string;
  minIntervalMs: number;
}) => {
  if (input.goal.status !== "active") {
    return false;
  }
  const nowMs = Date.parse(input.nowIso);
  if (!Number.isFinite(nowMs)) {
    return false;
  }
  const reviewMs = input.goal.nextReviewAt
    ? Date.parse(input.goal.nextReviewAt)
    : Number.NaN;
  if (input.lastDecisionAt === null) {
    return true;
  }
  const lastDecisionMs = Date.parse(input.lastDecisionAt);
  if (
    Number.isFinite(reviewMs) &&
    reviewMs <= nowMs &&
    (!Number.isFinite(lastDecisionMs) || lastDecisionMs < reviewMs)
  ) {
    return true;
  }
  return (
    !Number.isFinite(lastDecisionMs) ||
    nowMs - lastDecisionMs >= input.minIntervalMs
  );
};

export { isGoalReviewDue };
