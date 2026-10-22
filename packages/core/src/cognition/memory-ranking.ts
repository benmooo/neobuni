type ScoredMemory = {
	memoryId: string;
	vectorSimilarity: number;
	keywordScore: number;
	importance: number;
	finalScore: number;
};

type ScoreInput = {
	vectorDistance: number;
	queryKeywords: string[];
	memoryKeywords: string[];
	importance: number;
};

const distanceToSimilarity = (distance: number): number => 1 / (1 + distance);

const keywordMatchScore = (
	queryKeywords: string[],
	memoryKeywords: string[]
): number => {
	if (queryKeywords.length === 0) {
		return 0;
	}
	const lowerMemory = memoryKeywords.map((k) => k.toLowerCase());
	const matches = queryKeywords.filter((q) =>
		lowerMemory.includes(q.toLowerCase())
	);
	return matches.length / queryKeywords.length;
};

const computeMemoryScore = (input: ScoreInput): number => {
	const vectorSim = distanceToSimilarity(input.vectorDistance);
	const kwScore = keywordMatchScore(input.queryKeywords, input.memoryKeywords);
	return vectorSim * 0.6 + kwScore * 0.3 + input.importance * 0.1;
};

const rankMemories = (
	memories: ScoredMemory[],
	threshold = 0.45,
	limit = 5
): ScoredMemory[] =>
	memories
		.filter((m) => m.finalScore >= threshold)
		.sort((a, b) => b.finalScore - a.finalScore)
		.slice(0, limit);

export type { ScoredMemory, ScoreInput };
export {
	computeMemoryScore,
	distanceToSimilarity,
	keywordMatchScore,
	rankMemories,
};
