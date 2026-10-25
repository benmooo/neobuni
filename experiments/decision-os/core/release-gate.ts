import type { DecisionEvaluationSummary } from "@neobuni/contracts";

interface DecisionReleaseGate {
  passed: boolean;
  reasons: string[];
}
const evaluateDecisionReleaseGate = (input: {
  summary: DecisionEvaluationSummary;
  minComparedPairs: number;
  minAgreementRate: number;
  maxAverageJevLatencyMs: number;
  maxProviderErrorRate: number;
}): DecisionReleaseGate => {
  const reasons = [
    input.summary.comparedJudgmentPairs < input.minComparedPairs
      ? "insufficient_compared_pairs"
      : null,
    input.minComparedPairs > 0 &&
    (input.summary.agreementRate === null ||
      input.summary.agreementRate < input.minAgreementRate)
      ? "agreement_below_threshold"
      : null,
    input.summary.jevProviderErrorRate !== null &&
    input.summary.jevProviderErrorRate > input.maxProviderErrorRate
      ? "jev_provider_error_rate_above_threshold"
      : null,
    input.summary.averageJevLatencyMs !== null &&
    input.summary.averageJevLatencyMs > input.maxAverageJevLatencyMs
      ? "jev_latency_above_threshold"
      : null,
  ].filter((reason): reason is string => reason !== null);
  return { passed: reasons.length === 0, reasons };
};

export type { DecisionReleaseGate };
export { evaluateDecisionReleaseGate };
