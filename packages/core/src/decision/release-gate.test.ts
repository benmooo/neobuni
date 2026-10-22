import { describe, expect, test } from "vitest";
import { evaluateDecisionReleaseGate } from "./release-gate";

const summary = {
	totalDecisions: 20,
	totalJudgments: 40,
	judgmentsByProvider: {},
	comparedJudgmentPairs: 20,
	matchingJudgmentPairs: 18,
	agreementRate: 0.9,
	averageJevLatencyMs: 120,
	feedbackByKind: {},
	decisionReasonsByKind: {},
	jevAttemptedDecisionCount: 20,
	jevProviderErrorDecisionCount: 0,
	jevProviderErrorRate: 0,
};
describe("evaluateDecisionReleaseGate", () => {
	test("requires enough paired evidence, agreement, and healthy latency", () => {
		expect(
			evaluateDecisionReleaseGate({
				summary,
				minComparedPairs: 20,
				minAgreementRate: 0.85,
				maxAverageJevLatencyMs: 500,
				maxProviderErrorRate: 0.2,
			})
		).toEqual({ passed: true, reasons: [] });
		expect(
			evaluateDecisionReleaseGate({
				summary: { ...summary, comparedJudgmentPairs: 2 },
				minComparedPairs: 20,
				minAgreementRate: 0.85,
				maxAverageJevLatencyMs: 500,
				maxProviderErrorRate: 0.2,
			}).reasons
		).toContain("insufficient_compared_pairs");
		expect(
			evaluateDecisionReleaseGate({
				summary: { ...summary, agreementRate: 0.7 },
				minComparedPairs: 20,
				minAgreementRate: 0.85,
				maxAverageJevLatencyMs: 500,
				maxProviderErrorRate: 0.2,
			}).reasons
		).toContain("agreement_below_threshold");
	});
});
