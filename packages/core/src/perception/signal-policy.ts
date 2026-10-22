import type { Signal, SignalSet } from "@neobuni/contracts";

type SignalStrengthBand = "weak" | "medium" | "strong";

type SignalConsumptionMode = "observe" | "context_hint" | "decision_input";

type SignalCategory =
  | "text"
  | "memory"
  | "schedule"
  | "behavioral"
  | "environmental";

interface SignalProfile {
  categoryCounts: Record<SignalCategory, number>;
  contextHintSignalCount: number;
  decisionSignalCount: number;
  mediumSignalCount: number;
  observeSignalCount: number;
  strongSignalCount: number;
  topSignals: Array<{
    kind: string;
    score: number;
    strengthBand: SignalStrengthBand;
    consumptionMode: SignalConsumptionMode;
  }>;
  totalSignalCount: number;
  weakSignalCount: number;
}

const round = (value: number) => Math.round(value * 100) / 100;
const isString = (value: unknown): value is string => typeof value === "string";
const consumptionRank: Record<SignalConsumptionMode, number> = {
  observe: 0,
  context_hint: 1,
  decision_input: 2,
};

const getSignalStrengthBand = (score: number): SignalStrengthBand =>
  score >= 0.7 ? "strong" : score >= 0.4 ? "medium" : "weak";

const getSignalCategory = (signal: Signal): SignalCategory => {
  if ("memoryIds" in signal) {
    return "memory";
  }

  if ("scheduleIds" in signal) {
    return "schedule";
  }

  if ("evidenceWindow" in signal) {
    return "behavioral";
  }

  if ("evidence" in signal) {
    return "text";
  }

  return "environmental";
};

const consumptionThresholds: Record<
  string,
  {
    contextHintAt: number;
    decisionInputAt?: number;
  }
> = {
  support_request: { contextHintAt: 0.45, decisionInputAt: 0.68 },
  reflection_request: { contextHintAt: 0.45, decisionInputAt: 0.66 },
  planning_request: { contextHintAt: 0.45, decisionInputAt: 0.68 },
  warmth: { contextHintAt: 0.42, decisionInputAt: 0.7 },
  distress: { contextHintAt: 0.4, decisionInputAt: 0.62 },
  explicit_memory_reference: { contextHintAt: 0.45, decisionInputAt: 0.7 },
  topic_continuity: { contextHintAt: 0.4, decisionInputAt: 0.62 },
  unresolved_overlap: { contextHintAt: 0.35, decisionInputAt: 0.6 },
  recent_overlap: { contextHintAt: 0.35, decisionInputAt: 0.58 },
  personal_history_candidate: { contextHintAt: 0.4, decisionInputAt: 0.62 },
  relationship_candidate: { contextHintAt: 0.4, decisionInputAt: 0.62 },
  upcoming_commitment: { contextHintAt: 0.42, decisionInputAt: 0.68 },
  schedule_disruption: { contextHintAt: 0.48, decisionInputAt: 0.66 },
  missed_commitment: { contextHintAt: 0.45, decisionInputAt: 0.64 },
  time_pressure: { contextHintAt: 0.45, decisionInputAt: 0.62 },
  negative_trend: { contextHintAt: 0.45, decisionInputAt: 0.62 },
  withdrawal_pattern: { contextHintAt: 0.45, decisionInputAt: 0.62 },
  routine_shift: { contextHintAt: 0.45, decisionInputAt: 0.64 },
  initiative_drop: { contextHintAt: 0.45, decisionInputAt: 0.62 },
  time_context: { contextHintAt: 0.3 },
  location_context: { contextHintAt: 0.35 },
  device_context: { contextHintAt: 0.35 },
  ambient_context: { contextHintAt: 0.35 },
};

const getSignalConsumptionMode = (signal: Signal): SignalConsumptionMode => {
  const thresholds = consumptionThresholds[signal.kind];

  if (!thresholds || signal.score < thresholds.contextHintAt) {
    return "observe";
  }

  if (
    thresholds.decisionInputAt !== undefined &&
    signal.score >= thresholds.decisionInputAt
  ) {
    return "decision_input";
  }

  return "context_hint";
};

const readSignalConsumptionMode = (signal: Signal): SignalConsumptionMode => {
  const metadataValue = signal.metadata.consumptionMode;

  return isString(metadataValue) &&
    (metadataValue === "observe" ||
      metadataValue === "context_hint" ||
      metadataValue === "decision_input")
    ? metadataValue
    : getSignalConsumptionMode(signal);
};

const readSignalStrengthBand = (signal: Signal): SignalStrengthBand => {
  const metadataValue = signal.metadata.strengthBand;

  return isString(metadataValue) &&
    (metadataValue === "weak" ||
      metadataValue === "medium" ||
      metadataValue === "strong")
    ? metadataValue
    : getSignalStrengthBand(signal.score);
};

const hasMinimumConsumptionMode = (
  signal: Signal,
  minimum: SignalConsumptionMode
) =>
  consumptionRank[readSignalConsumptionMode(signal)] >=
  consumptionRank[minimum];

const annotateSignalQuality = <T extends Signal>(signal: T): T => {
  const strengthBand = getSignalStrengthBand(signal.score);
  const consumptionMode = getSignalConsumptionMode(signal);

  return {
    ...signal,
    metadata: {
      ...signal.metadata,
      strengthBand,
      consumptionMode,
    },
  };
};

const flattenSignalSet = (signalSet: SignalSet): Signal[] => [
  ...signalSet.textSignals,
  ...signalSet.memorySignals,
  ...signalSet.scheduleSignals,
  ...signalSet.behavioralSignals,
  ...signalSet.environmentalSignals,
];

const emptyCategoryCounts = (): Record<SignalCategory, number> => ({
  text: 0,
  memory: 0,
  schedule: 0,
  behavioral: 0,
  environmental: 0,
});

const summarizeSignalSet = (signalSet: SignalSet): SignalProfile => {
  const annotated = flattenSignalSet(signalSet).map(annotateSignalQuality);

  const profile = annotated.reduce<Omit<SignalProfile, "topSignals">>(
    (acc, signal) => {
      const strengthBand = getSignalStrengthBand(signal.score);
      const consumptionMode = readSignalConsumptionMode(signal);
      const category = getSignalCategory(signal);

      return {
        totalSignalCount: acc.totalSignalCount + 1,
        weakSignalCount:
          acc.weakSignalCount + (strengthBand === "weak" ? 1 : 0),
        mediumSignalCount:
          acc.mediumSignalCount + (strengthBand === "medium" ? 1 : 0),
        strongSignalCount:
          acc.strongSignalCount + (strengthBand === "strong" ? 1 : 0),
        observeSignalCount:
          acc.observeSignalCount + (consumptionMode === "observe" ? 1 : 0),
        contextHintSignalCount:
          acc.contextHintSignalCount +
          (consumptionMode === "context_hint" ? 1 : 0),
        decisionSignalCount:
          acc.decisionSignalCount +
          (consumptionMode === "decision_input" ? 1 : 0),
        categoryCounts: {
          ...acc.categoryCounts,
          [category]: acc.categoryCounts[category] + 1,
        },
      };
    },
    {
      totalSignalCount: 0,
      weakSignalCount: 0,
      mediumSignalCount: 0,
      strongSignalCount: 0,
      observeSignalCount: 0,
      contextHintSignalCount: 0,
      decisionSignalCount: 0,
      categoryCounts: emptyCategoryCounts(),
    }
  );

  const topSignals = annotated
    .map((signal) => ({
      kind: signal.kind,
      score: round(signal.score),
      strengthBand: getSignalStrengthBand(signal.score),
      consumptionMode: readSignalConsumptionMode(signal),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  return { ...profile, topSignals };
};

export {
  annotateSignalQuality,
  flattenSignalSet,
  getSignalCategory,
  getSignalConsumptionMode,
  getSignalStrengthBand,
  hasMinimumConsumptionMode,
  readSignalConsumptionMode,
  readSignalStrengthBand,
  summarizeSignalSet,
};
