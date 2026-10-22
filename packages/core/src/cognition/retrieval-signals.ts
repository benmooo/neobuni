import type { MemorySlice } from "@neobuni/contracts";

import {
	clampScore,
	computeOverlap,
	continuityPatterns,
	explicitReferencePatterns,
	extractMemoryKeywords,
	historyPatterns,
	includesAny,
	normalizeText,
	preferencePatterns,
	relationshipPatterns,
	roundScore,
	taskPatterns,
	worldKnowledgePatterns,
} from "./retrieval-shared";

type RetrievalSignalInput = {
	latestUserText: string;
	recentUserTexts: string[];
	unresolvedMemories: MemorySlice[];
	recentMemories: MemorySlice[];
};

type RetrievalSignals = {
	explicitPersonalReferenceScore: number;
	autobiographicalIntentScore: number;
	continuityScore: number;
	unresolvedOverlapScore: number;
	recentOverlapScore: number;
	relationshipLookupScore: number;
	taskFollowupScore: number;
	worldKnowledgeScore: number;
	topicTerms: string[];
	entityTerms: string[];
};

const buildRetrievalSignals = (
	input: RetrievalSignalInput
): RetrievalSignals => {
	const normalized = normalizeText(input.latestUserText);
	const queryTokens = extractMemoryKeywords(input.latestUserText);
	const explicitPersonalReferenceScore = includesAny(
		normalized,
		explicitReferencePatterns
	)
		? 0.88
		: 0;
	const autobiographicalIntentScore =
		includesAny(normalized, preferencePatterns) ||
		includesAny(normalized, taskPatterns) ||
		includesAny(normalized, historyPatterns)
			? 0.58
			: 0;
	const continuityScore =
		includesAny(normalized, continuityPatterns) &&
		input.recentUserTexts.length > 1
			? 0.42
			: 0;
	const unresolvedOverlapScore = clampScore(
		computeOverlap(queryTokens, input.unresolvedMemories)
	);
	const recentOverlapScore = clampScore(
		computeOverlap(queryTokens, input.recentMemories)
	);
	const relationshipLookupScore = includesAny(normalized, relationshipPatterns)
		? 0.84
		: 0;
	const taskFollowupScore = includesAny(normalized, taskPatterns) ? 0.74 : 0;
	const worldKnowledgeScore = includesAny(normalized, worldKnowledgePatterns)
		? explicitPersonalReferenceScore > 0
			? 0.36
			: 0.82
		: 0;
	const topicTerms = queryTokens.slice(0, 8);
	const entityTerms = topicTerms
		.filter((token) => token.length >= 3 || /[\u4e00-\u9fff]{2,}/.test(token))
		.slice(0, 6);

	return {
		explicitPersonalReferenceScore: roundScore(explicitPersonalReferenceScore),
		autobiographicalIntentScore: roundScore(autobiographicalIntentScore),
		continuityScore: roundScore(continuityScore),
		unresolvedOverlapScore,
		recentOverlapScore,
		relationshipLookupScore: roundScore(relationshipLookupScore),
		taskFollowupScore: roundScore(taskFollowupScore),
		worldKnowledgeScore: roundScore(worldKnowledgeScore),
		topicTerms,
		entityTerms,
	};
};

export type { RetrievalSignalInput, RetrievalSignals };
export { buildRetrievalSignals };
