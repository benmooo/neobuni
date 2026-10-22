import type { MemorySignal, MemorySlice, SignalSet } from "@neobuni/contracts";

import { extractMemoryKeywords } from "../cognition/memory-gate";
import { annotateSignalQuality } from "./signal-policy";

const normalizeText = (text: string) => text.trim().toLowerCase();
const unique = <T>(values: T[]) => Array.from(new Set(values));

const toTokenSet = (memory: MemorySlice) =>
	new Set([
		...memory.keywords.map(normalizeText),
		...extractMemoryKeywords(memory.content),
	]);

const computeOverlap = (queryTokens: string[], memories: MemorySlice[]) => {
	if (queryTokens.length === 0 || memories.length === 0) {
		return { score: 0, memoryIds: [] as string[] };
	}

	const querySet = new Set(queryTokens);

	return memories.reduce(
		(best, memory) => {
			const memoryTokens = toTokenSet(memory);
			const matches = [...querySet].filter((token) => memoryTokens.has(token));
			const score = matches.length / querySet.size;

			if (score <= best.score) {
				return best;
			}

			return {
				score,
				memoryIds: [memory.id],
			};
		},
		{ score: 0, memoryIds: [] as string[] }
	);
};

const maybeMemorySignal = (
	score: number,
	kind: MemorySignal["kind"],
	memoryIds: string[]
): MemorySignal[] =>
	score > 0
		? [
				{
					kind,
					score: Math.min(1, Number(score.toFixed(2))),
					memoryIds,
					metadata: {},
				},
			]
		: [];

const adaptMemorySignals = (input: {
	latestUserText: string;
	unresolvedSlices: MemorySlice[];
	recentSlices: MemorySlice[];
}): SignalSet["memorySignals"] => {
	const queryTokens = unique(extractMemoryKeywords(input.latestUserText));
	const unresolvedOverlap = computeOverlap(queryTokens, input.unresolvedSlices);
	const recentOverlap = computeOverlap(queryTokens, input.recentSlices);

	return [
		...maybeMemorySignal(
			unresolvedOverlap.score,
			"unresolved_overlap",
			unresolvedOverlap.memoryIds
		),
		...maybeMemorySignal(
			recentOverlap.score,
			"recent_overlap",
			recentOverlap.memoryIds
		),
	].map(annotateSignalQuality);
};

export { adaptMemorySignals };
