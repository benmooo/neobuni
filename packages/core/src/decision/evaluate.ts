import type {
	Decision,
	DecisionAnswer,
	DecisionEvaluationSummary,
	DecisionFeedback,
} from "@neobuni/contracts";

type EvaluationJudgment = DecisionAnswer & {
	provider: "heuristic" | "jev" | "system_two" | "policy";
	latencyMs: number | null;
};

type EvaluationTrace = {
	judgments: EvaluationJudgment[];
	feedback: Pick<DecisionFeedback, "kind">[];
	decision?: Pick<Decision, "policyResult">;
};

const areSelectedValuesEqual = (
	left: DecisionAnswer["selectedValue"],
	right: DecisionAnswer["selectedValue"]
) => left === right;

const summarizeDecisionEvaluation = (
	traces: EvaluationTrace[],
	options: { questionIds?: readonly string[] } = {}
): DecisionEvaluationSummary => {
	const questionIds = options.questionIds ? new Set(options.questionIds) : null;
	const scopedTraces = questionIds
		? traces.filter((trace) =>
				trace.judgments.some((judgment) => questionIds.has(judgment.questionId))
			)
		: traces;
	const selectJudgments = (trace: EvaluationTrace) =>
		questionIds
			? trace.judgments.filter((judgment) =>
					questionIds.has(judgment.questionId)
				)
			: trace.judgments;
	const judgments = scopedTraces.flatMap(selectJudgments);
	const feedback = scopedTraces.flatMap((trace) => trace.feedback);
	const decisionReasons = scopedTraces.flatMap(
		(trace) => trace.decision?.policyResult.reasons ?? []
	);
	const pairs = scopedTraces.flatMap((trace) => {
		const traceJudgments = selectJudgments(trace);
		const heuristicByQuestion = new Map(
			traceJudgments
				.filter((judgment) => judgment.provider === "heuristic")
				.map((judgment) => [judgment.questionId, judgment])
		);
		return traceJudgments
			.filter((judgment) => judgment.provider === "jev")
			.flatMap((jev) => {
				const heuristic = heuristicByQuestion.get(jev.questionId);
				return heuristic ? [{ heuristic, jev }] : [];
			});
	});
	const jevLatencies = judgments.flatMap((judgment) =>
		judgment.provider === "jev" && judgment.latencyMs !== null
			? [judgment.latencyMs]
			: []
	);
	const countBy = (values: string[]) =>
		Object.fromEntries(
			values.reduce(
				(counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1),
				new Map<string, number>()
			)
		);
	const jevAttemptedDecisionCount = scopedTraces.filter((trace) => {
		const reasons = trace.decision?.policyResult.reasons ?? [];
		return (
			reasons.includes("jev_provider_error") ||
			reasons.includes("jev_shadow_observed") ||
			reasons.includes("jev_shadow_observed_no_behavior_change") ||
			reasons.includes("jev_high_confidence_retrieval_suppression")
		);
	}).length;
	const jevProviderErrorDecisionCount = scopedTraces.filter((trace) =>
		(trace.decision?.policyResult.reasons ?? []).includes("jev_provider_error")
	).length;
	const matchingJudgmentPairs = pairs.filter(({ heuristic, jev }) =>
		areSelectedValuesEqual(heuristic.selectedValue, jev.selectedValue)
	).length;
	return {
		totalDecisions: scopedTraces.length,
		totalJudgments: judgments.length,
		judgmentsByProvider: countBy(
			judgments.map((judgment) => judgment.provider)
		),
		comparedJudgmentPairs: pairs.length,
		matchingJudgmentPairs,
		agreementRate:
			pairs.length === 0 ? null : matchingJudgmentPairs / pairs.length,
		averageJevLatencyMs:
			jevLatencies.length === 0
				? null
				: jevLatencies.reduce((sum, value) => sum + value, 0) /
					jevLatencies.length,
		feedbackByKind: countBy(feedback.map((item) => item.kind)),
		decisionReasonsByKind: countBy(decisionReasons),
		jevAttemptedDecisionCount,
		jevProviderErrorDecisionCount,
		jevProviderErrorRate:
			jevAttemptedDecisionCount === 0
				? null
				: jevProviderErrorDecisionCount / jevAttemptedDecisionCount,
	};
};

export type { EvaluationTrace };
export { summarizeDecisionEvaluation };
