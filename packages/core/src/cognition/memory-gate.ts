type MemorySlice = {
  id: string;
  content: string;
  type: "event" | "thought" | "preference" | "fact" | "task";
  keywords: string[];
  unresolved: boolean;
  createdAt: string;
};

type MemoryGateInput = {
  latestUserText: string;
  recentUserTexts: string[];
  unresolvedMemories: MemorySlice[];
  recentMemories: MemorySlice[];
};

type MemoryGateDecision = {
  shouldPreRecall: boolean;
  strategy: "pre_recall" | "tool_fallback" | "skip";
  score: number;
  reasons: string[];
  explicitReferenceScore: number;
  autobiographicalIntentScore: number;
  unresolvedMatchScore: number;
  recentMatchScore: number;
  continuityScore: number;
};

type MemoryRecallQuery = {
  rawQuery: string;
  expandedQuery: string;
  keywords: string[];
  targetPools: ReadonlyArray<"unresolved" | "recent" | "global">;
  expectedTypes: Array<"event" | "thought" | "preference" | "fact" | "task">;
};

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

const planPatterns = [
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

const roundScore = (value: number) => Math.round(value * 100) / 100;

const clampScore = (value: number) => Math.min(1, Math.max(0, roundScore(value)));

const buildMemoryGateDecision = (
  input: MemoryGateInput,
): MemoryGateDecision => {
  const normalized = normalizeText(input.latestUserText);
  const queryTokens = extractMemoryKeywords(input.latestUserText);
  const explicitReferenceScore = includesAny(normalized, explicitReferencePatterns) ? 0.88 : 0;
  const hasAutobiographicalIntent =
    includesAny(normalized, preferencePatterns) ||
    includesAny(normalized, planPatterns) ||
    includesAny(normalized, historyPatterns);
  const autobiographicalIntentScore = hasAutobiographicalIntent ? 0.58 : 0;
  const continuityScore =
    includesAny(normalized, continuityPatterns) && input.recentUserTexts.length > 1 ? 0.42 : 0;
  const unresolvedMatchScore = clampScore(
    computeOverlap(queryTokens, input.unresolvedMemories),
  );
  const recentMatchScore = clampScore(
    computeOverlap(queryTokens, input.recentMemories),
  );

  const weightedScore = clampScore(
    explicitReferenceScore * 0.55 +
      autobiographicalIntentScore * 0.2 +
      unresolvedMatchScore * 0.35 +
      recentMatchScore * 0.25 +
      continuityScore * 0.15,
  );
  const score = clampScore(Math.max(explicitReferenceScore, weightedScore));

  const strategy =
    score >= 0.72 ? "pre_recall"
    : score >= 0.35 ? "tool_fallback"
    : "skip";

  const reasons = [
    explicitReferenceScore > 0 ? "explicit_reference" : null,
    autobiographicalIntentScore > 0 ? "autobiographical_intent" : null,
    unresolvedMatchScore >= 0.34 ? "unresolved_overlap" : null,
    recentMatchScore >= 0.34 ? "recent_overlap" : null,
    continuityScore > 0 ? "continuity_signal" : null,
  ].filter((reason): reason is string => reason !== null);

  return {
    shouldPreRecall: strategy === "pre_recall",
    strategy,
    score,
    reasons,
    explicitReferenceScore: roundScore(explicitReferenceScore),
    autobiographicalIntentScore: roundScore(autobiographicalIntentScore),
    unresolvedMatchScore,
    recentMatchScore,
    continuityScore: roundScore(continuityScore),
  };
};

const dedupe = <T extends string>(values: T[]) => Array.from(new Set(values));

const inferExpectedTypes = (text: string): MemoryRecallQuery["expectedTypes"] => {
  const normalized = normalizeText(text);

  if (includesAny(normalized, preferencePatterns)) {
    return ["preference", "fact"];
  }

  if (includesAny(normalized, planPatterns)) {
    return ["task", "event"];
  }

  if (includesAny(normalized, historyPatterns) || includesAny(normalized, explicitReferencePatterns)) {
    return ["event", "thought", "task"];
  }

  return ["event", "thought", "preference", "fact", "task"];
};

const buildMemoryRecallQuery = (input: {
  latestUserText: string;
  recentUserTexts: string[];
  unresolvedMemories: MemorySlice[];
  recentMemories: MemorySlice[];
  decision: MemoryGateDecision;
}): MemoryRecallQuery => {
  const rawQuery = input.latestUserText.trim();
  const previousUserText = input.recentUserTexts[1]?.trim();
  const expandedQuery =
    input.decision.continuityScore > 0 && previousUserText
      ? `${previousUserText}\n${rawQuery}`
      : rawQuery;

  const baseKeywords = extractMemoryKeywords(rawQuery);
  const overlapKeywords = dedupe(
    [...input.unresolvedMemories, ...input.recentMemories]
      .flatMap((memory) => memory.keywords)
      .map(normalizeText)
      .filter((keyword) => baseKeywords.includes(keyword)),
  );
  const keywords = dedupe([...baseKeywords, ...overlapKeywords]).slice(0, 6);

  const targetPools = dedupe([
    input.decision.unresolvedMatchScore >= 0.34 ? "unresolved" : null,
    input.decision.recentMatchScore >= 0.34 || input.decision.continuityScore > 0 ? "recent" : null,
    "global",
  ].filter((value): value is "unresolved" | "recent" | "global" => value !== null)) as Array<
    "unresolved" | "recent" | "global"
  >;

  return {
    rawQuery,
    expandedQuery,
    keywords,
    targetPools,
    expectedTypes: inferExpectedTypes(rawQuery),
  };
};

export {
  buildMemoryGateDecision,
  buildMemoryRecallQuery,
  extractMemoryKeywords,
};
export type {
  MemoryGateDecision,
  MemoryGateInput,
  MemoryRecallQuery,
  MemorySlice,
};
