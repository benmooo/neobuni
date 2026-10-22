import type {
	MemoryStoreKind,
	RetrievalPlan,
	RetrievalReason,
	TurnContext,
} from "@neobuni/contracts";

import { planStoreActivation } from "./retrieval-activation";
import { classifyRetrievalIntents } from "./retrieval-intent";
import { buildStoreQueries } from "./retrieval-queries";
import { dedupe } from "./retrieval-shared";
import { buildRetrievalSignals } from "./retrieval-signals";

const inferRetrievalReasons = (input: {
	retrievalPlan: Pick<RetrievalPlan, "intent" | "intentProfile" | "activation">;
}): RetrievalReason[] =>
	dedupe(
		[
			input.retrievalPlan.activation.temporal.reasons.includes(
				"explicit_personal_reference"
			)
				? "explicit_reference"
				: null,
			input.retrievalPlan.intentProfile.topicContinuity >= 0.34
				? "topic_continuity"
				: null,
			input.retrievalPlan.intentProfile.taskState >= 0.45
				? "task_followup"
				: null,
			input.retrievalPlan.activation.graph.reasons.includes(
				"relationship_lookup"
			)
				? "relationship_lookup"
				: null,
			input.retrievalPlan.intent === "world_knowledge" ||
			input.retrievalPlan.intentProfile.worldKnowledge >= 0.45
				? "world_knowledge"
				: null,
			"hybrid",
		].filter((reason): reason is RetrievalReason => reason !== null)
	);

const buildRetrievalPlan = (turnContext: TurnContext) => {
	const signals = buildRetrievalSignals({
		latestUserText: turnContext.input.latestUserText,
		recentUserTexts: turnContext.recentUserTexts,
		unresolvedMemories: turnContext.unresolvedSlices,
		recentMemories: turnContext.recentSlices,
	});
	const { primaryIntent, intentProfile } = classifyRetrievalIntents(signals);
	const activation = planStoreActivation({
		primaryIntent,
		intentProfile,
		signals,
	});
	const queries = buildStoreQueries({
		latestUserText: turnContext.input.latestUserText,
		recentUserTexts: turnContext.recentUserTexts,
		unresolvedMemories: turnContext.unresolvedSlices,
		recentMemories: turnContext.recentSlices,
		primaryIntent,
		activation,
		signals,
	});
	const stores: MemoryStoreKind[] = [
		...(queries.temporal ? (["temporal"] as const) : []),
		...(queries.graph ? (["graph"] as const) : []),
		...(queries.knowledge ? (["knowledge"] as const) : []),
	];
	const retrievalPlanBase = {
		intent: primaryIntent,
		intentProfile,
		activation,
	} satisfies Pick<RetrievalPlan, "intent" | "intentProfile" | "activation">;
	const reasons = inferRetrievalReasons({
		retrievalPlan: retrievalPlanBase,
	});

	return {
		retrievalSignals: signals,
		retrievalPlan: {
			...retrievalPlanBase,
			queries,
			reasons,
			stores,
		} satisfies RetrievalPlan,
	};
};

export { buildRetrievalPlan, inferRetrievalReasons };
