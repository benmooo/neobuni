import type {
	GraphRetrievalQuery,
	KnowledgeRetrievalQuery,
	MemorySlice,
	RetrievalIntent,
	StoreActivationPlan,
	StoreQuerySet,
	TemporalRetrievalQuery,
} from "@neobuni/contracts";
import { dedupe, inferExpectedTypes, normalizeText } from "./retrieval-shared";
import type { RetrievalSignals } from "./retrieval-signals";

const buildTemporalQuery = (input: {
	latestUserText: string;
	recentUserTexts: string[];
	unresolvedMemories: MemorySlice[];
	recentMemories: MemorySlice[];
	signals: RetrievalSignals;
}): TemporalRetrievalQuery => {
	const rawQuery = input.latestUserText.trim();
	const previousUserText = input.recentUserTexts[1]?.trim();
	const expandedQuery =
		input.signals.continuityScore > 0 && previousUserText
			? `${previousUserText}\n${rawQuery}`
			: rawQuery;
	const baseKeywords = input.signals.topicTerms;
	const overlapKeywords = dedupe(
		[...input.unresolvedMemories, ...input.recentMemories]
			.flatMap((memory) => memory.keywords)
			.map(normalizeText)
			.filter((keyword) => baseKeywords.includes(keyword))
	);
	const keywords = dedupe([...baseKeywords, ...overlapKeywords]).slice(0, 6);
	const targetPools = dedupe(
		[
			input.signals.unresolvedOverlapScore >= 0.34 ? "unresolved" : null,
			input.signals.recentOverlapScore >= 0.34 ||
			input.signals.continuityScore > 0
				? "recent"
				: null,
			"global",
		].filter(
			(value): value is "unresolved" | "recent" | "global" => value !== null
		)
	);

	return {
		query: expandedQuery,
		keywords,
		targetPools,
		expectedTypes: inferExpectedTypes(rawQuery),
		limit: 8,
	};
};

const buildGraphQuery = (input: {
	latestUserText: string;
	primaryIntent: RetrievalIntent;
	signals: RetrievalSignals;
}): GraphRetrievalQuery => {
	const rawTerms = input.latestUserText
		.split(/\s+/)
		.map((part) => normalizeText(part))
		.filter((part) => part.length > 2);
	const seedTerms = dedupe([
		...input.signals.entityTerms,
		...input.signals.topicTerms,
		...rawTerms,
	]).slice(0, 6);

	return {
		seedTerms,
		relationTypes:
			input.primaryIntent === "relationship_state"
				? ["related_to", "about", "prefers", "states"]
				: ["about", "related_to", "prefers", "states"],
		maxDepth: 1,
		limit: 6,
	};
};

const buildKnowledgeQuery = (input: {
	latestUserText: string;
	signals: RetrievalSignals;
}): KnowledgeRetrievalQuery => ({
	query: input.latestUserText.trim(),
	keywords: input.signals.topicTerms.slice(0, 6),
	limit: 5,
});

const buildStoreQueries = (input: {
	latestUserText: string;
	recentUserTexts: string[];
	unresolvedMemories: MemorySlice[];
	recentMemories: MemorySlice[];
	primaryIntent: RetrievalIntent;
	activation: StoreActivationPlan;
	signals: RetrievalSignals;
}): StoreQuerySet => ({
	temporal:
		input.activation.temporal.mode === "prefetch"
			? buildTemporalQuery({
					latestUserText: input.latestUserText,
					recentUserTexts: input.recentUserTexts,
					unresolvedMemories: input.unresolvedMemories,
					recentMemories: input.recentMemories,
					signals: input.signals,
				})
			: null,
	graph:
		input.activation.graph.mode === "prefetch"
			? buildGraphQuery({
					latestUserText: input.latestUserText,
					primaryIntent: input.primaryIntent,
					signals: input.signals,
				})
			: null,
	knowledge:
		input.activation.knowledge.mode === "prefetch"
			? buildKnowledgeQuery({
					latestUserText: input.latestUserText,
					signals: input.signals,
				})
			: null,
});

export { buildStoreQueries };
