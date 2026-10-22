type MemoryEntry = {
	id: string;
	content: string;
	type: string;
	keywords: string[];
	importance: number;
	unresolved: boolean;
	createdAt: string;
	similarity?: number;
};

type SurfacingResult = {
	memories: MemoryEntry[];
	tiers: {
		unresolved: string[];
		topicRelated: string[];
		recent: string[];
	};
};

const MAX_TOTAL = 8;
const MAX_UNRESOLVED = 2;
const MAX_TOPIC = 3;

const surfaceMemories = (
	scoredMemories: MemoryEntry[],
	unresolvedMemories: MemoryEntry[],
	recentMemories: MemoryEntry[]
): SurfacingResult => {
	const selected = new Set<string>();
	const result: MemoryEntry[] = [];
	const tiers = {
		unresolved: [] as string[],
		topicRelated: [] as string[],
		recent: [] as string[],
	};

	// Tier 1: unresolved (max 2)
	for (const m of unresolvedMemories) {
		if (selected.size >= MAX_TOTAL) {
			break;
		}
		if (tiers.unresolved.length >= MAX_UNRESOLVED) {
			break;
		}
		if (selected.has(m.id)) {
			continue;
		}
		selected.add(m.id);
		result.push(m);
		tiers.unresolved.push(m.id);
	}

	// Tier 2: topic-related with similarity >= 0.50 (max 3)
	for (const m of scoredMemories) {
		if (selected.size >= MAX_TOTAL) {
			break;
		}
		if (tiers.topicRelated.length >= MAX_TOPIC) {
			break;
		}
		if (selected.has(m.id)) {
			continue;
		}
		if ((m.similarity ?? 0) < 0.5) {
			continue;
		}
		selected.add(m.id);
		result.push(m);
		tiers.topicRelated.push(m.id);
	}

	// Tier 3: recent 3-day fill (up to MAX_TOTAL)
	for (const m of recentMemories) {
		if (selected.size >= MAX_TOTAL) {
			break;
		}
		if (selected.has(m.id)) {
			continue;
		}
		selected.add(m.id);
		result.push(m);
		tiers.recent.push(m.id);
	}

	return { memories: result, tiers };
};

export type { MemoryEntry, SurfacingResult };
export { surfaceMemories };
