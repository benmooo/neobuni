import { describe, expect, test } from "vitest";

import { isStudyReviewDue, updateStudyMastery } from "./mastery";

describe("updateStudyMastery", () => {
  test("moves a first high score upward and schedules a long review", () => {
    const result = updateStudyMastery({
      assessedAt: "2026-10-26T20:45:00.000Z",
      current: null,
      score: 1,
    });

    expect(result.score).toBeCloseTo(0.4, 5);
    expect(result.attempts).toBe(1);
    expect(result.confidence).toBeCloseTo(1 / 3, 5);
    expect(result.needsReteach).toBe(false);
    expect(result.nextReviewAt).toBe("2026-11-09");
  });

  test("keeps a second low score low and schedules reteach tomorrow", () => {
    const result = updateStudyMastery({
      assessedAt: "2026-10-26T20:45:00.000Z",
      current: { attempts: 1, confidence: 1 / 3, score: 0.4 },
      score: 0,
    });

    expect(result.score).toBeCloseTo(0.3, 5);
    expect(result.attempts).toBe(2);
    expect(result.needsReteach).toBe(true);
    expect(result.nextReviewAt).toBe("2026-10-27");
  });

  test("extends the interval to 30 days after repeated mastery", () => {
    const result = updateStudyMastery({
      assessedAt: "2026-10-26T20:45:00.000Z",
      current: { attempts: 3, confidence: 1, score: 0.92 },
      score: 0.95,
    });

    expect(result.attempts).toBe(4);
    expect(result.nextReviewAt).toBe("2026-11-25");
  });
});

describe("isStudyReviewDue", () => {
  test("is due on or after the scheduled review date", () => {
    expect(
      isStudyReviewDue({ localDate: "2026-11-09", nextReviewAt: "2026-11-09" })
    ).toBe(true);
    expect(
      isStudyReviewDue({ localDate: "2026-11-10", nextReviewAt: "2026-11-09" })
    ).toBe(true);
    expect(
      isStudyReviewDue({ localDate: "2026-11-08", nextReviewAt: "2026-11-09" })
    ).toBe(false);
    expect(
      isStudyReviewDue({ localDate: "2026-11-08", nextReviewAt: null })
    ).toBe(false);
  });
});
