import type {
	DecisionAnswer,
	DecisionCandidate,
	DecisionRequest,
	RetrievalPlan,
} from "@neobuni/contracts";

const toActivationValue = (mode: "prefetch" | "defer_to_tool" | "skip") =>
	mode === "prefetch"
		? "retrieve_now"
		: mode === "defer_to_tool"
			? "defer"
			: "skip";

const buildRetrievalShadowDecision = (input: {
	decisionId: string;
	latestUserText: string;
	retrievalPlan: RetrievalPlan;
	includeGraphV2Shadow?: boolean;
}) => {
	const candidates: DecisionCandidate[] = [
		{
			id: "temporal",
			kind: "memory_store",
			title: "Temporal memory",
			rationale: "Retrieve personal history and unresolved context.",
			reversibility: "reversible",
			authority: "none",
			eligible: input.retrievalPlan.activation.temporal.mode !== "skip",
		},
		{
			id: "graph",
			kind: "memory_store",
			title: "Graph memory",
			rationale: "Retrieve entities and relationships.",
			reversibility: "reversible",
			authority: "none",
			eligible: input.retrievalPlan.activation.graph.mode !== "skip",
		},
		{
			id: "knowledge",
			kind: "memory_store",
			title: "Knowledge store",
			rationale: "Retrieve grounded world knowledge.",
			reversibility: "reversible",
			authority: "none",
			eligible: input.retrievalPlan.activation.knowledge.mode !== "skip",
		},
	];
	const questions: DecisionRequest["questions"] = [
		{
			id: "retrieval.temporal_activation.v1",
			kind: "choice",
			instructions:
				"Given `request` and `stores.temporal`, should Buni retrieve personal temporal memory now, defer it to a later tool call, or skip it?",
			criteria: {
				retrieve_now:
					"Personal history or open commitments are materially relevant now.",
				defer:
					"The request might need personal context but immediate retrieval is not justified.",
				skip: "Personal temporal memory is not relevant.",
			},
		},
		{
			id: "retrieval.graph_activation.v1",
			kind: "noul",
			instructions:
				"Is graph memory about entities or relationships needed to answer `request`?",
		},
		{
			id: "retrieval.knowledge_activation.v1",
			kind: "noul",
			instructions:
				"Is Buni's grounded knowledge store needed to answer `request`?",
		},
		...(input.includeGraphV2Shadow
			? [
					{
						id: "retrieval.graph_activation.v2" as const,
						kind: "noul" as const,
						instructions:
							"Should Buni retrieve graph memory now? Answer false when graph evidence freshness is unknown, stale, or identity could be ambiguous.",
						criteria: {
							true: "A current explicit entity or relationship fact is necessary and fresh.",
							false:
								"Freshness is unknown or stale, identity is ambiguous, or graph retrieval is not necessary.",
						},
					},
				]
			: []),
	];
	const heuristicAnswers: DecisionAnswer[] = [
		{
			questionId: "retrieval.temporal_activation.v1",
			kind: "choice",
			selectedValue: toActivationValue(
				input.retrievalPlan.activation.temporal.mode
			),
			probabilities: {
				retrieve_now:
					input.retrievalPlan.activation.temporal.mode === "prefetch" ? 1 : 0,
				defer:
					input.retrievalPlan.activation.temporal.mode === "defer_to_tool"
						? 1
						: 0,
				skip: input.retrievalPlan.activation.temporal.mode === "skip" ? 1 : 0,
			},
			confidence: input.retrievalPlan.activation.temporal.score,
		},
		{
			questionId: "retrieval.graph_activation.v1",
			kind: "noul",
			selectedValue: input.retrievalPlan.activation.graph.mode === "prefetch",
			probabilities: {
				true: input.retrievalPlan.activation.graph.score,
				false: 1 - input.retrievalPlan.activation.graph.score,
			},
			confidence: input.retrievalPlan.activation.graph.score,
		},
		...(input.includeGraphV2Shadow
			? [
					{
						questionId: "retrieval.graph_activation.v2",
						kind: "noul" as const,
						selectedValue: false,
						probabilities: { true: 0, false: 1 },
						confidence: 1,
					},
				]
			: []),
		{
			questionId: "retrieval.knowledge_activation.v1",
			kind: "noul",
			selectedValue:
				input.retrievalPlan.activation.knowledge.mode === "prefetch",
			probabilities: {
				true: input.retrievalPlan.activation.knowledge.score,
				false: 1 - input.retrievalPlan.activation.knowledge.score,
			},
			confidence: input.retrievalPlan.activation.knowledge.score,
		},
	];
	return {
		candidates,
		heuristicAnswers,
		request: {
			decisionId: input.decisionId,
			state: {
				request: input.latestUserText,
				stores: input.retrievalPlan.activation,
				retrievalIntent: input.retrievalPlan.intent,
				graphEvidenceFreshness: "unknown",
				graphSeedTerms: input.retrievalPlan.queries.graph?.seedTerms ?? [],
			},
			questions,
		} satisfies DecisionRequest,
	};
};

export { buildRetrievalShadowDecision };
