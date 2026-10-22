import { describe, expect, test } from "vitest";
import { decisionEvaluationFixtures } from "./evaluation-fixtures";
import {
	compileEvaluationFixtureRequest,
	replayDecisionEvaluationFixtures,
} from "./evaluation-replay";

describe("decision evaluation replay", () => {
	test("compiles only a bounded, versioned question for a fixture", () => {
		const request = compileEvaluationFixtureRequest(
			decisionEvaluationFixtures[0]!
		);
		expect(request.decisionId).toBe(
			"evaluation:retrieval-temporal-positive-zh-v1"
		);
		expect(request.questions).toHaveLength(1);
		expect(request.questions[0]?.id).toBe("retrieval.temporal_activation.v1");
	});

	test("compiles initiative candidate IDs into Choice criteria", () => {
		const fixture = decisionEvaluationFixtures.find(
			(item) => item.familyId === "initiative.best_candidate.v1"
		)!;
		expect(
			compileEvaluationFixtureRequest(fixture).questions[0]?.criteria
		).toEqual({
			"commitment:blocked": "Candidate commitment:blocked",
			"commitment:open": "Candidate commitment:open",
		});
	});

	test("reports DRI-reviewed replay results as release-gate evidence", async () => {
		const report = await replayDecisionEvaluationFixtures({
			fixtures: decisionEvaluationFixtures.slice(0, 2),
			includedReviewStatuses: ["reviewed"],
			generatedAt: "2026-10-21T00:00:00.000Z",
			provider: {
				id: "test-provider",
				decide: async (request) => ({
					providerId: "test-provider",
					providerVersion: "test-v1",
					latencyMs: 12,
					answers: [
						{
							questionId: request.questions[0]!.id,
							kind: request.questions[0]!.kind,
							selectedValue: String(request.state.request).includes("上周")
								? "retrieve_now"
								: "skip",
							probabilities: {},
							confidence: 1,
						},
					],
				}),
			},
		});
		expect(report).toMatchObject({
			reviewedItemCount: 2,
			reviewedMatchRate: 1,
			draftItemCount: 0,
			draftMatchRate: null,
		});
	});

	test("uses an explicit score tolerance for score fixtures", async () => {
		const fixture = decisionEvaluationFixtures.find(
			(item) => item.id === "evidence-relevance-low-score-direct-zh-v1"
		)!;
		const report = await replayDecisionEvaluationFixtures({
			fixtures: [fixture],
			includedReviewStatuses: ["reviewed"],
			generatedAt: "2026-10-21T00:00:00.000Z",
			provider: {
				id: "test-provider",
				decide: async (request) => ({
					providerId: "test-provider",
					providerVersion: "test-v1",
					latencyMs: 12,
					answers: [
						{
							questionId: request.questions[0]!.id,
							kind: "score",
							selectedValue: 0.75,
							probabilities: {},
							confidence: 1,
						},
					],
				}),
			},
		});
		expect(report.reviewedMatchRate).toBe(1);
	});
});
