import type {
	DecisionAnswer,
	DecisionCandidate,
	DecisionRequest,
} from "@neobuni/contracts";
import {
	buildInterruptionValueShadowQuestion,
	buildInterruptionValueState,
	calculateHeuristicInterruptionValue,
} from "./interruption-value";
import {
	orderNextActionCandidates,
	selectHeuristicNextAction,
} from "./next-action";

const buildNextActionShadowDecision = (input: {
	decisionId: string;
	candidates: DecisionCandidate[];
}) => {
	const eligibleCandidates = orderNextActionCandidates(
		input.candidates.filter((candidate) => candidate.eligible)
	).slice(0, 3);
	const heuristicCandidate = selectHeuristicNextAction(eligibleCandidates);
	const interruptionValue = calculateHeuristicInterruptionValue({
		candidates: eligibleCandidates,
	});
	const heuristicAnswers: DecisionAnswer[] = [
		...(heuristicCandidate
			? [
					{
						questionId: "initiative.best_candidate.v1",
						kind: "choice" as const,
						selectedValue: heuristicCandidate.id,
						probabilities: Object.fromEntries(
							eligibleCandidates.map((candidate) => [
								candidate.id,
								candidate.id === heuristicCandidate.id ? 1 : 0,
							])
						),
						confidence: 1,
					},
				]
			: []),
		{
			questionId: "initiative.interruption_value.v1",
			kind: "score",
			selectedValue: interruptionValue,
			probabilities: {},
			confidence: 1,
		},
	];
	return {
		heuristicAnswers,
		request:
			eligibleCandidates.length === 0
				? null
				: ({
						decisionId: input.decisionId,
						state: {
							...buildInterruptionValueState({
								candidates: eligibleCandidates,
							}),
							decisionFamily: "initiative.shadow_bundle.v1",
						},
						questions: [
							{
								id: "initiative.best_candidate.v1",
								kind: "choice",
								instructions:
									"Select the single candidate ID that most usefully advances the explicit goal. Choose only from `candidates`; do not create an action or grant permission.",
								criteria: Object.fromEntries(
									eligibleCandidates.map((candidate) => [
										candidate.id,
										candidate.rationale,
									])
								),
							},
							buildInterruptionValueShadowQuestion(),
						],
					} satisfies DecisionRequest),
	};
};

export { buildNextActionShadowDecision };
