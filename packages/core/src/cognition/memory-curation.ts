import type { MemoryClass, MemoryStatus, MemoryType } from "@neobuni/contracts";

import { extractMemoryKeywords } from "./memory-gate";

interface ComparableMemory {
  content: string;
  id: string;
  keywords: string[];
  status: MemoryStatus;
  type: MemoryType;
  unresolved: boolean;
}

interface ChatMemoryDraftInput {
  content: string;
  importance?: number;
  keywords?: string[];
  memoryClass?: MemoryClass;
  status?: MemoryStatus;
  type: MemoryType;
  unresolved?: boolean;
}

interface ResolvedChatMemoryDraft {
  content: string;
  importance: number;
  keywords: string[];
  memoryClass: MemoryClass;
  status: MemoryStatus;
  type: MemoryType;
  unresolved: boolean;
}

type MemoryConflictKind = "semantic_overlap" | "task_overlap";

interface MemoryConflictCandidate {
  kind: MemoryConflictKind;
  memoryId: string;
  reason: string;
  score: number;
}

interface MemoryConflictDetection {
  conflict: MemoryConflictCandidate | null;
  duplicateMemory: ComparableMemory | null;
}

const normalizeText = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

const uniqueKeywords = (values: string[]) => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (key.length === 0 || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const deriveMemoryClass = (
  type: MemoryType,
  provided?: MemoryClass
): MemoryClass =>
  provided ??
  (type === "task"
    ? "task"
    : type === "fact" || type === "preference"
      ? "semantic"
      : "episodic");

const deriveImportance = (type: MemoryType, provided?: number) =>
  provided ??
  (type === "task"
    ? 0.72
    : type === "preference"
      ? 0.68
      : type === "fact"
        ? 0.66
        : 0.55);

const normalizeMemoryKeywords = (
  content: string,
  providedKeywords: string[] | undefined
) =>
  uniqueKeywords([
    ...(providedKeywords ?? []),
    ...extractMemoryKeywords(content),
  ]).slice(0, 8);

const resolveChatMemoryDraft = (
  input: ChatMemoryDraftInput
): ResolvedChatMemoryDraft => ({
  content: input.content.trim(),
  type: input.type,
  keywords: normalizeMemoryKeywords(input.content, input.keywords),
  importance: deriveImportance(input.type, input.importance),
  unresolved: input.unresolved ?? input.type === "task",
  status: input.status ?? "active",
  memoryClass: deriveMemoryClass(input.type, input.memoryClass),
});

const computeKeywordOverlap = (left: string[], right: string[]) => {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const rightSet = new Set(right.map((value) => value.toLowerCase()));
  const sharedCount = left.filter((value) =>
    rightSet.has(value.toLowerCase())
  ).length;

  return sharedCount / Math.max(left.length, right.length);
};

const isExactDuplicate = (
  draft: ResolvedChatMemoryDraft,
  existing: ComparableMemory
) =>
  draft.type === existing.type &&
  normalizeText(draft.content) === normalizeText(existing.content) &&
  draft.unresolved === existing.unresolved;

const detectMemoryConflict = (input: {
  draft: ResolvedChatMemoryDraft;
  existingMemories: ComparableMemory[];
  excludeMemoryIds?: string[];
}): MemoryConflictDetection => {
  const excludedIds = new Set(input.excludeMemoryIds ?? []);
  const candidates = input.existingMemories.filter(
    (memory) =>
      memory.status === "active" &&
      memory.type === input.draft.type &&
      !excludedIds.has(memory.id)
  );

  const duplicateMemory =
    candidates.find((memory) => isExactDuplicate(input.draft, memory)) ?? null;

  if (duplicateMemory) {
    return {
      duplicateMemory,
      conflict: null,
    };
  }

  const scoredConflicts = candidates.reduce<MemoryConflictCandidate[]>(
    (items, memory) => {
      const overlap = computeKeywordOverlap(
        input.draft.keywords,
        normalizeMemoryKeywords(memory.content, memory.keywords)
      );

      if (input.draft.type === "task") {
        const score = overlap * 0.8 + (memory.unresolved ? 0.2 : 0);

        if (score >= 0.45 && memory.unresolved) {
          items.push({
            memoryId: memory.id,
            kind: "task_overlap",
            score,
            reason:
              "This new task overlaps with an existing open task and may represent the same commitment.",
          });
        }

        return items;
      }

      if (
        (input.draft.type === "fact" || input.draft.type === "preference") &&
        overlap >= 0.55
      ) {
        items.push({
          memoryId: memory.id,
          kind: "semantic_overlap",
          score: overlap,
          reason: `A similar active ${input.draft.type} memory already exists and may need replacement or merge.`,
        });
      }

      return items;
    },
    []
  );

  const conflict =
    scoredConflicts.sort((left, right) => right.score - left.score)[0] ?? null;

  return {
    duplicateMemory: null,
    conflict,
  };
};

export type {
  ChatMemoryDraftInput,
  ComparableMemory,
  MemoryConflictCandidate,
  MemoryConflictDetection,
  MemoryConflictKind,
  ResolvedChatMemoryDraft,
};
export { deriveMemoryClass, detectMemoryConflict, resolveChatMemoryDraft };
