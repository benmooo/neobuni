type ProtectiveLevel = 0 | 1 | 2 | 3;

type DetectedEmotion =
  | "neutral"
  | "low"
  | "anxious"
  | "overwhelmed"
  | "collapsed";

type CurrentTurnInput = {
  text: string;
  detectedEmotion?: DetectedEmotion;
  emotionConfidence?: number;
};

type RecentContext = {
  recentUserTurns: string[];
  recentAssistantTurns: string[];
  recentNegativeTrend?: number;
  repeatedAbnormalPattern?: boolean;
};

type UserBaseline = {
  knownFragilityAreas?: string[];
  baselineSleepPatternKnown?: boolean;
  baselineDeviationScore?: number;
};

type ExternalSignals = {
  behaviorAnomalyScore?: number;
  environmentRiskScore?: number;
  scheduleDisruptionScore?: number;
};

type PreviousProtectiveState = {
  level: ProtectiveLevel;
  stableTurnsSinceLastEscalation: number;
  lastEscalationReasons: string[];
};

type ProtectiveDecision = {
  level: ProtectiveLevel;
  activateProtectiveStance: boolean;
  shouldReorderDrives: boolean;
  allowElevatedInitiative: boolean;
  reasons: string[];
  confidence: number;
};

type ProtectiveEvaluatorInput = {
  currentTurn: CurrentTurnInput;
  recentContext: RecentContext;
  baseline?: UserBaseline;
  externalSignals?: ExternalSignals;
  previousState?: PreviousProtectiveState;
  canGuardWhenAbnormal: boolean;
};

const lowDistressSignals = [
  "烦",
  "累",
  "难受",
  "焦虑",
  "烦躁",
  "委屈",
  "失眠",
  "睡不着",
  "stressed",
  "tired",
  "anxious",
  "upset",
  "lonely",
  "can't sleep",
];

const mediumDistressSignals = [
  "崩溃",
  "撑不住",
  "受不了",
  "没意义",
  "绝望",
  "好痛苦",
  "压得我喘不过气",
  "overwhelmed",
  "falling apart",
  "hopeless",
  "can't do this",
  "breaking down",
];

const highRiskSignals = [
  "不想活",
  "活不下去",
  "想消失",
  "伤害自己",
  "自杀",
  "结束一切",
  "不如死",
  "kill myself",
  "hurt myself",
  "end it all",
  "want to die",
  "don't want to live",
];

const normalizeText = (text: string) => text.trim().toLowerCase();

const includesAny = (text: string, patterns: string[]) =>
  patterns.some((pattern) => text.includes(pattern));

const clampLevel = (value: number): ProtectiveLevel => {
  if (value >= 3) return 3;
  if (value <= 0) return 0;
  return value as ProtectiveLevel;
};

const toScoreLevel = (score?: number): ProtectiveLevel => {
  if ((score ?? 0) >= 0.85) return 3;
  if ((score ?? 0) >= 0.6) return 2;
  if ((score ?? 0) >= 0.3) return 1;
  return 0;
};

const detectLanguageLevel = (text: string): ProtectiveLevel => {
  const normalized = normalizeText(text);

  if (includesAny(normalized, highRiskSignals)) {
    return 3;
  }

  if (includesAny(normalized, mediumDistressSignals)) {
    return 2;
  }

  if (includesAny(normalized, lowDistressSignals)) {
    return 1;
  }

  return 0;
};

const detectEmotionLevel = (emotion?: DetectedEmotion): ProtectiveLevel => {
  if (emotion === "collapsed") return 2;
  if (emotion === "overwhelmed") return 2;
  if (emotion === "anxious") return 1;
  if (emotion === "low") return 1;
  return 0;
};

const countAbnormalTurns = (turns: string[]) =>
  turns.filter((turn) => detectLanguageLevel(turn) >= 1).length;

const buildReasons = (parts: Array<string | null>) =>
  parts.filter((value): value is string => value !== null);

const applyLevelInertia = (
  previousState: PreviousProtectiveState | undefined,
  targetLevel: ProtectiveLevel,
  languageLevel: ProtectiveLevel,
): ProtectiveLevel => {
  if (!previousState) {
    return targetLevel;
  }

  if (targetLevel > previousState.level) {
    const maxStep = languageLevel >= 3 ? 2 : 1;
    return clampLevel(
      Math.min(targetLevel, previousState.level + maxStep),
    );
  }

  if (targetLevel < previousState.level) {
    return previousState.stableTurnsSinceLastEscalation >= 2
      ? clampLevel(previousState.level - 1)
      : previousState.level;
  }

  return previousState.level;
};

const evaluateProtectiveDecision = (
  input: ProtectiveEvaluatorInput,
): ProtectiveDecision => {
  const languageLevel = detectLanguageLevel(input.currentTurn.text);
  const emotionLevel = detectEmotionLevel(input.currentTurn.detectedEmotion);
  const behaviorLevel = toScoreLevel(input.externalSignals?.behaviorAnomalyScore);
  const environmentLevel = toScoreLevel(input.externalSignals?.environmentRiskScore);
  const scheduleLevel = toScoreLevel(input.externalSignals?.scheduleDisruptionScore);
  const baselineLevel = toScoreLevel(input.baseline?.baselineDeviationScore);
  const abnormalTurns = countAbnormalTurns(input.recentContext.recentUserTurns);
  const persistenceBoost =
    abnormalTurns >= 3 || input.recentContext.repeatedAbnormalPattern ? 1 : 0;
  const trendBoost = (input.recentContext.recentNegativeTrend ?? 0) >= 0.55 ? 1 : 0;
  const multiSignalBoost =
    [emotionLevel, behaviorLevel, environmentLevel, scheduleLevel].filter(
      (level) => level >= 1,
    ).length >= 2
      ? 1
      : 0;

  const maxBaseLevel = Math.max(
    languageLevel,
    emotionLevel,
    behaviorLevel,
    environmentLevel,
    scheduleLevel,
    baselineLevel,
  );

  const boostedLevel = clampLevel(
    maxBaseLevel + Math.min(1, persistenceBoost + trendBoost + multiSignalBoost),
  );

  const level = input.canGuardWhenAbnormal
    ? applyLevelInertia(input.previousState, boostedLevel, languageLevel)
    : 0;

  const reasons = buildReasons([
    languageLevel >= 3 ? "language:high_risk" : null,
    languageLevel === 2 ? "language:acute_distress" : null,
    languageLevel === 1 ? "language:low_distress" : null,
    emotionLevel >= 2 ? "emotion:overwhelmed" : null,
    emotionLevel === 1 ? "emotion:elevated" : null,
    behaviorLevel >= 1 ? "behavior:anomaly" : null,
    environmentLevel >= 1 ? "environment:risk" : null,
    scheduleLevel >= 1 ? "schedule:disrupted" : null,
    baselineLevel >= 1 ? "baseline:deviation" : null,
    persistenceBoost >= 1 ? "pattern:persistent" : null,
    trendBoost >= 1 ? "pattern:negative_trend" : null,
    multiSignalBoost >= 1 ? "pattern:multi_signal" : null,
  ]);

  const supportSignalCount = reasons.length;
  const confidence = Math.min(
    1,
    0.25 +
      supportSignalCount * 0.12 +
      (input.currentTurn.emotionConfidence ?? 0) * 0.2,
  );

  return {
    level,
    activateProtectiveStance: level >= 1,
    shouldReorderDrives: level >= 1,
    allowElevatedInitiative: input.canGuardWhenAbnormal && level >= 2,
    reasons,
    confidence,
  };
};

export {
  evaluateProtectiveDecision,
  type CurrentTurnInput,
  type DetectedEmotion,
  type ExternalSignals,
  type PreviousProtectiveState,
  type ProtectiveDecision,
  type ProtectiveEvaluatorInput,
  type ProtectiveLevel,
  type RecentContext,
  type UserBaseline,
};
