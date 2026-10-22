import type {
  BehavioralSignal,
  RuntimeTurnSignalInput,
  SignalSet,
} from "@neobuni/contracts";

import { annotateSignalQuality } from "./signal-policy";

const distressPatterns = [
  "累",
  "烦",
  "难受",
  "失眠",
  "焦虑",
  "慌",
  "崩溃",
  "撑不住",
  "绝望",
  "想消失",
  "sad",
  "tired",
  "anxious",
  "panic",
  "hopeless",
  "can't go on",
];

const retreatPatterns = [
  "算了",
  "随便",
  "没事",
  "不想说",
  "不知道",
  "别管我",
  "idk",
  "whatever",
  "fine",
  "nvm",
];

const normalizeText = (text: string) => text.trim().toLowerCase();
const includesAny = (text: string, patterns: string[]) =>
  patterns.some((pattern) => text.includes(pattern));
const round = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number) => Math.min(1, Math.max(0, round(value)));
const uniqueTexts = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

const average = (values: number[]) =>
  values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

const countProtectiveTurns = (turns: RuntimeTurnSignalInput[]) =>
  turns.filter((turn) => (turn.protectiveLevel ?? 0) >= 1).length;

const computeNegativeTrendScore = (input: {
  distressRatio: number;
  distressHitCount: number;
  protectiveTurnCount: number;
  runtimeSampleSize: number;
}) => {
  const protectiveRatio =
    input.runtimeSampleSize > 0
      ? input.protectiveTurnCount / input.runtimeSampleSize
      : 0;

  return clamp(
    0.38 +
      input.distressRatio * 0.24 +
      protectiveRatio * 0.24 +
      (input.distressHitCount >= 3 ? 0.1 : 0),
  );
};

const computeWithdrawalScore = (input: {
  distressRatio: number;
  retreating: boolean;
  latestLength: number;
  protectiveTurnCount: number;
}) =>
  clamp(
    0.34 +
      (input.retreating ? 0.18 : 0) +
      Math.min(0.16, input.distressRatio * 0.24) +
      (input.latestLength <= 8 ? 0.08 : 0) +
      (input.protectiveTurnCount >= 1 ? 0.06 : 0),
  );

const computeInitiativeDropScore = (input: {
  lengthDropRatio: number;
  retreating: boolean;
  distressRatio: number;
}) =>
  clamp(
    0.32 +
      input.lengthDropRatio * 0.34 +
      (input.retreating ? 0.08 : 0) +
      (input.distressRatio >= 0.5 ? 0.06 : 0),
  );

const adaptBehavioralSignals = (input: {
  latestUserText: string;
  recentUserTexts: string[];
  recentRuntimeTurns: RuntimeTurnSignalInput[];
}): SignalSet["behavioralSignals"] => {
  const textWindow = uniqueTexts([
    input.latestUserText,
    ...input.recentUserTexts,
  ]).slice(0, 4);
  const normalizedLatest = normalizeText(input.latestUserText);
  const recentOnly = textWindow.slice(1);
  const recentLengths = recentOnly.map((text) => text.length);
  const baselineLength = average(recentLengths);
  const latestLength = input.latestUserText.trim().length;
  const distressHitCount = textWindow.filter((text) =>
    includesAny(normalizeText(text), distressPatterns),
  ).length;
  const distressRatio =
    textWindow.length > 0
      ? distressHitCount / textWindow.length
      : 0;
  const protectiveTurnCount = countProtectiveTurns(input.recentRuntimeTurns.slice(0, 4));
  const retreating = includesAny(normalizedLatest, retreatPatterns);
  const lengthDropRatio =
    baselineLength > 0
      ? Math.max(0, 1 - latestLength / baselineLength)
      : 0;

  const signals: BehavioralSignal[] = [];

  if (
    distressHitCount >= 2 ||
    protectiveTurnCount >= 2 ||
    (textWindow.length >= 3 && distressRatio >= 0.45)
  ) {
    signals.push({
      kind: "negative_trend",
      score: computeNegativeTrendScore({
        distressRatio,
        distressHitCount,
        protectiveTurnCount,
        runtimeSampleSize: input.recentRuntimeTurns.slice(0, 4).length,
      }),
      evidenceWindow: textWindow.join(" | "),
      metadata: {
        distressHitCount,
        distressRatio: round(distressRatio),
        protectiveTurnCount,
        sampleSize: textWindow.length,
      },
    });
  }

  if (
    (retreating && distressRatio >= 0.25) ||
    (latestLength > 0 && latestLength <= 12 && distressRatio >= 0.5)
  ) {
    signals.push({
      kind: "withdrawal_pattern",
      score: computeWithdrawalScore({
        distressRatio,
        retreating,
        latestLength,
        protectiveTurnCount,
      }),
      evidenceWindow: textWindow.join(" | "),
      metadata: {
        latestLength,
        distressHitCount,
        distressRatio: round(distressRatio),
        protectiveTurnCount,
        retreating,
      },
    });
  }

  if (baselineLength >= 18 && lengthDropRatio >= 0.35 && latestLength < baselineLength) {
    signals.push({
      kind: "initiative_drop",
      score: computeInitiativeDropScore({
        lengthDropRatio,
        retreating,
        distressRatio,
      }),
      evidenceWindow: textWindow.join(" | "),
      metadata: {
        latestLength,
        distressHitCount,
        baselineLength: round(baselineLength),
        lengthDropRatio: round(lengthDropRatio),
        retreating,
      },
    });
  }

  return signals.map(annotateSignalQuality);
};

export { adaptBehavioralSignals };
