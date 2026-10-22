import type {
  EvidenceItem,
  RetrievalReason,
  TemporalMemorySourceTier,
} from "@neobuni/contracts";

type TemporalRecalledMemory = {
  id?: string;
  content: string;
  type: string;
  keywords: string[];
  importance?: number;
  similarity?: number;
  sourceTier?: TemporalMemorySourceTier;
  unresolved?: boolean;
};

const toTemporalEvidenceKind = (memoryType: string): EvidenceItem["kind"] => {
  if (memoryType === "task") {
    return "task";
  }

  if (memoryType === "fact") {
    return "fact";
  }

  if (memoryType === "event") {
    return "event";
  }

  return "memory";
};

const toTemporalEvidenceScore = (
  memory: TemporalRecalledMemory,
  fallbackSourceTier: TemporalMemorySourceTier,
) => {
  if (typeof memory.similarity === "number" && memory.similarity > 0) {
    return memory.similarity;
  }

  if (fallbackSourceTier === "unresolved_carryover") {
    return 0.45;
  }

  if (fallbackSourceTier === "recent_continuity") {
    return 0.35;
  }

  return 0.3;
};

const buildEvidenceItemsFromTemporalMemories = (input: {
  memories: TemporalRecalledMemory[];
  retrievalReason: RetrievalReason;
}): EvidenceItem[] =>
  input.memories.map((memory, index) => {
    const sourceTier = memory.sourceTier ?? "vector_hit";

    return {
      id: memory.id ?? `temporal-memory-${index}`,
      store: "temporal",
      kind: toTemporalEvidenceKind(memory.type),
      title: null,
      content: memory.content,
      score: toTemporalEvidenceScore(memory, sourceTier),
      confidence:
        typeof memory.similarity === "number" && memory.similarity > 0
          ? memory.similarity
          : null,
      recency: null,
      retrievalReason: input.retrievalReason,
      provenance: {
        sourceType: "memory",
        sourceId: memory.id ?? `memory-${index}`,
        citationLabel: memory.type,
      },
      metadata: {
        memoryType: memory.type,
        keywords: memory.keywords,
        importance: memory.importance ?? null,
        similarity: memory.similarity ?? null,
        sourceTier,
        unresolved: memory.unresolved ?? false,
      },
    };
  });

const fuseEvidenceItems = (input: {
  temporal?: EvidenceItem[];
  graph?: EvidenceItem[];
  knowledge?: EvidenceItem[];
}): EvidenceItem[] => {
  const ranked = [
    ...(input.temporal ?? []),
    ...(input.graph ?? []),
    ...(input.knowledge ?? []),
  ].sort((left, right) => right.score - left.score);

  const selected = new Set<string>();

  return ranked.filter((item) => {
    const key = `${item.store}:${item.provenance.sourceId}:${item.kind}:${item.content}`;

    if (selected.has(key)) {
      return false;
    }

    selected.add(key);
    return true;
  });
};

export {
  buildEvidenceItemsFromTemporalMemories,
  fuseEvidenceItems,
};

export type {
  TemporalRecalledMemory,
};
