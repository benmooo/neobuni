import { describe, expect, test } from "vitest"
import {
  decisionEvaluationFixtures,
  findFixtureCoverageGaps,
} from "./evaluation-fixtures"

describe("decision evaluation fixtures", () => {
  test("covers required failure modes and supported languages", () => {
    expect(findFixtureCoverageGaps(decisionEvaluationFixtures)).toEqual([])
  })

  test("keeps review evidence only with DRI-approved labels", () => {
    const reviewedFixtures = decisionEvaluationFixtures.filter(
      (fixture) => fixture.reviewStatus === "reviewed",
    )
    const draftFixtures = decisionEvaluationFixtures.filter(
      (fixture) => fixture.reviewStatus === "draft",
    )

    expect(reviewedFixtures.length).toBeGreaterThan(0)
    expect(
      reviewedFixtures.every(
        (fixture) =>
          fixture.reviewedBy === "buni-product-dri" &&
          fixture.reviewedAt !== null &&
          fixture.reviewRationale !== null,
      ),
    ).toBe(true)
    expect(
      draftFixtures.every(
        (fixture) =>
          fixture.reviewedBy === null &&
          fixture.reviewedAt === null &&
          fixture.reviewRationale === null,
      ),
    ).toBe(true)
  })
})
