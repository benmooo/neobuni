import type {
  SignalSet,
  TextSignal,
} from "@neobuni/contracts";

import { annotateSignalQuality } from "./signal-policy";

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

const supportivePatterns = [
  "陪我",
  "抱抱",
  "别走",
  "在吗",
  "陪陪我",
  "stay with me",
  "be here",
];

const reflectivePatterns = [
  "为什么",
  "怎么办",
  "怎么做",
  "你觉得",
  "该不该",
  "why",
  "how",
  "should i",
];

const planningPatterns = [
  "计划",
  "步骤",
  "安排",
  "提醒",
  "待办",
  "执行",
  "plan",
  "steps",
  "schedule",
  "todo",
  "remind",
];

const warmthPatterns = [
  "谢谢",
  "抱抱",
  "想你",
  "晚安",
  "早安",
  "thank you",
  "good night",
  "good morning",
  "miss you",
];

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

const continuityPatterns = [
  "that",
  "it",
  "this",
  "那个",
  "这件事",
  "后来",
];

const normalizeText = (text: string) => text.trim().toLowerCase();

const includesAny = (text: string, patterns: string[]) =>
  patterns.some((pattern) => text.includes(pattern));

const maybeTextSignal = (
  active: boolean,
  signal: TextSignal,
) => (active ? [signal] : []);

const adaptTextSignals = (input: {
  latestUserText: string;
  recentUserTexts: string[];
}): SignalSet["textSignals"] => {
  const normalized = normalizeText(input.latestUserText);

  return [
    ...maybeTextSignal(
      includesAny(normalized, explicitReferencePatterns),
      {
        kind: "explicit_memory_reference",
        score: 0.88,
        evidence: input.latestUserText,
        metadata: {},
      },
    ),
    ...maybeTextSignal(
      includesAny(normalized, continuityPatterns) && input.recentUserTexts.length > 1,
      {
        kind: "topic_continuity",
        score: 0.42,
        evidence: input.latestUserText,
        metadata: {},
      },
    ),
    ...maybeTextSignal(
      includesAny(normalized, supportivePatterns),
      {
        kind: "support_request",
        score: 0.72,
        evidence: input.latestUserText,
        metadata: {},
      },
    ),
    ...maybeTextSignal(
      includesAny(normalized, reflectivePatterns),
      {
        kind: "reflection_request",
        score: 0.66,
        evidence: input.latestUserText,
        metadata: {},
      },
    ),
    ...maybeTextSignal(
      includesAny(normalized, planningPatterns),
      {
        kind: "planning_request",
        score: 0.74,
        evidence: input.latestUserText,
        metadata: {},
      },
    ),
    ...maybeTextSignal(
      includesAny(normalized, warmthPatterns),
      {
        kind: "warmth",
        score: 0.48,
        evidence: input.latestUserText,
        metadata: {},
      },
    ),
    ...maybeTextSignal(
      includesAny(normalized, distressPatterns),
      {
        kind: "distress",
        score: 0.8,
        evidence: input.latestUserText,
        metadata: {},
        },
      ),
  ].map(annotateSignalQuality);
};

export { adaptTextSignals };
