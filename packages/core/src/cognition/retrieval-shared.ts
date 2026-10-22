import type { MemorySlice } from "@neobuni/contracts";

const explicitReferencePatterns = [
  "remember",
  "last time",
  "before",
  "you remember",
  "之前",
  "上次",
  "还记得",
  "我们聊过",
];

const preferencePatterns = [
  "prefer",
  "favorite",
  "like",
  "dislike",
  "喜欢",
  "不喜欢",
  "偏好",
  "更喜欢",
];

const taskPatterns = [
  "plan",
  "todo",
  "remind",
  "schedule",
  "安排",
  "计划",
  "提醒",
  "待办",
];

const historyPatterns = [
  "did i say",
  "did we",
  "what happened",
  "是不是说过",
  "后来",
  "当时",
];

const continuityPatterns = [
  "that",
  "it",
  "this",
  "那个",
  "这件事",
  "后来",
];

const relationshipPatterns = [
  "relationship",
  "relation",
  "关系",
  "谁和谁",
  "谁跟谁",
];

const worldKnowledgePatterns = [
  "what is",
  "how does",
  "why does",
  "explain",
  "介绍",
  "解释",
  "原理",
  "区别",
  "是什么",
  "什么是",
];

const englishStopwords = new Set([
  "a",
  "an",
  "and",
  "are",
  "do",
  "for",
  "from",
  "how",
  "i",
  "if",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "the",
  "to",
  "we",
  "what",
  "when",
  "you",
]);

const roundScore = (value: number) => Math.round(value * 100) / 100;

const clampScore = (value: number) => Math.min(1, Math.max(0, roundScore(value)));

const dedupe = <T>(values: T[]) => Array.from(new Set(values));

const normalizeText = (text: string) => text.trim().toLowerCase();

const includesAny = (text: string, patterns: string[]) =>
  patterns.some((pattern) => text.includes(pattern));

const extractLatinTokens = (text: string) =>
  Array.from(
    new Set(
      (normalizeText(text).match(/[a-z0-9]{2,}/g) ?? []).filter(
        (token) => !englishStopwords.has(token),
      ),
    ),
  );

const extractCjkTokens = (text: string) => {
  const runs = normalizeText(text).match(/[\u4e00-\u9fff]{2,}/g) ?? [];

  return Array.from(
    new Set(
      runs.flatMap((run) => {
        if (run.length <= 4) {
          return [run];
        }

        const bigrams = Array.from({ length: run.length - 1 }, (_, index) =>
          run.slice(index, index + 2),
        );
        return [run.slice(0, 4), ...bigrams];
      }),
    ),
  );
};

const extractMemoryKeywords = (text: string) =>
  Array.from(new Set([...extractLatinTokens(text), ...extractCjkTokens(text)]));

const inferExpectedTypes = (text: string): Array<MemorySlice["type"]> => {
  const normalized = normalizeText(text);

  if (includesAny(normalized, preferencePatterns)) {
    return ["preference", "fact"];
  }

  if (includesAny(normalized, taskPatterns)) {
    return ["task", "event"];
  }

  if (
    includesAny(normalized, historyPatterns)
    || includesAny(normalized, explicitReferencePatterns)
  ) {
    return ["event", "thought", "task"];
  }

  return ["event", "thought", "preference", "fact", "task"];
};

const toMemoryTokenSet = (memory: MemorySlice) =>
  new Set([
    ...memory.keywords.map(normalizeText),
    ...extractMemoryKeywords(memory.content),
  ]);

const computeOverlap = (queryTokens: string[], memories: MemorySlice[]) => {
  if (queryTokens.length === 0 || memories.length === 0) {
    return 0;
  }

  const querySet = new Set(queryTokens);

  return memories.reduce((best, memory) => {
    const memoryTokens = toMemoryTokenSet(memory);
    const matches = [...querySet].filter((token) => memoryTokens.has(token));
    return Math.max(best, matches.length / querySet.size);
  }, 0);
};

export {
  clampScore,
  computeOverlap,
  continuityPatterns,
  dedupe,
  explicitReferencePatterns,
  extractMemoryKeywords,
  historyPatterns,
  includesAny,
  inferExpectedTypes,
  normalizeText,
  preferencePatterns,
  relationshipPatterns,
  roundScore,
  taskPatterns,
  worldKnowledgePatterns,
};
