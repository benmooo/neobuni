import type { StudyMastery } from "@neobuni/contracts";

import { addLocalDays, localDateOf } from "./date";

interface UpdateStudyMasteryInput {
  assessedAt: string;
  current: Pick<StudyMastery, "attempts" | "confidence" | "score"> | null;
  score: number;
}

interface UpdateStudyMasteryResult {
  attempts: number;
  confidence: number;
  lastAssessedAt: string;
  lastScore: number;
  needsReteach: boolean;
  nextReviewAt: string;
  score: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const reviewIntervalDays = (score: number, attempts: number): number => {
  if (score < 0.6) {
    return 1;
  }
  if (score < 0.8) {
    return 3;
  }
  if (score < 0.9) {
    return attempts >= 3 ? 14 : 7;
  }
  return attempts >= 3 ? 30 : 14;
};

const updateStudyMastery = (
  input: UpdateStudyMasteryInput
): UpdateStudyMasteryResult => {
  const score = clamp01(input.score);
  const attempts = (input.current?.attempts ?? 0) + 1;
  const previousScore = input.current?.score ?? 0;
  const alpha = attempts === 1 ? 0.4 : 0.25;
  const nextScore = clamp01(previousScore + alpha * (score - previousScore));
  const confidence = Math.min(1, attempts / 3);
  const intervalDays = reviewIntervalDays(score, attempts);

  return {
    attempts,
    confidence,
    lastAssessedAt: input.assessedAt,
    lastScore: score,
    needsReteach: score < 0.6,
    nextReviewAt: addLocalDays(localDateOf(input.assessedAt), intervalDays),
    score: nextScore,
  };
};

const isStudyReviewDue = (input: {
  localDate: string;
  nextReviewAt: string | null;
}): boolean =>
  input.nextReviewAt !== null && input.nextReviewAt <= input.localDate;

export type { UpdateStudyMasteryInput, UpdateStudyMasteryResult };
export { isStudyReviewDue, reviewIntervalDays, updateStudyMastery };
