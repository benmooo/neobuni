import type {
  EvidenceItem,
  Signal,
  SignalSet,
  WorkingMemory,
} from "@neobuni/contracts";

import { flattenSignalSet, hasMinimumConsumptionMode } from "../perception";

const emotionalPatterns = [
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
];

const normalizeText = (text: string) => text.trim().toLowerCase();

const includesAny = (text: string, patterns: string[]) =>
  patterns.some((pattern) => text.includes(pattern));

const maxSignalScore = (signals: Signal[], kinds: string[]) =>
  signals.reduce(
    (best, signal) =>
      kinds.includes(signal.kind) ? Math.max(best, signal.score) : best,
    0
  );

const buildConstraint = (input: {
  kind:
    | "emotional_safety"
    | "task_continuity"
    | "relationship_consistency"
    | "knowledge_grounding";
  content: string;
  sourceItems: EvidenceItem[];
}) => ({
  kind: input.kind,
  content: input.content,
  sourceIds: input.sourceItems.map((item) => item.id),
});

const buildActionCandidate = (input: {
  kind:
    | "offer_supportive_followup"
    | "resolve_open_loop"
    | "ground_answer_in_world_facts"
    | "clarify_relationship_context";
  content: string;
  score: number;
  sourceItems: EvidenceItem[];
}) => ({
  kind: input.kind,
  content: input.content,
  score: Math.min(1, Math.max(0, Number(input.score.toFixed(2)))),
  sourceIds: input.sourceItems.map((item) => item.id),
});

const buildWorkingMemory = (input: {
  fusedEvidence: EvidenceItem[];
  signals: SignalSet;
}): WorkingMemory => {
  const consumableSignals = flattenSignalSet(input.signals).filter((signal) =>
    hasMinimumConsumptionMode(signal, "context_hint")
  );
  const decisionSignals = consumableSignals.filter((signal) =>
    hasMinimumConsumptionMode(signal, "decision_input")
  );
  const personalContext = input.fusedEvidence.filter(
    (item) => item.store === "temporal" && item.kind !== "task"
  );
  const relationshipState = input.fusedEvidence.filter(
    (item) =>
      item.store === "graph" || item.retrievalReason === "relationship_lookup"
  );
  const activeTasks = input.fusedEvidence.filter(
    (item) => item.kind === "task"
  );
  const worldFacts = input.fusedEvidence.filter(
    (item) => item.store === "knowledge"
  );
  const emotionalState = personalContext.filter((item) =>
    includesAny(normalizeText(item.content), emotionalPatterns)
  );
  const distressContextScore = maxSignalScore(consumableSignals, [
    "distress",
    "negative_trend",
    "withdrawal_pattern",
  ]);
  const planningContextScore = maxSignalScore(consumableSignals, [
    "planning_request",
    "time_pressure",
    "upcoming_commitment",
    "schedule_disruption",
    "missed_commitment",
  ]);
  const continuityContextScore = maxSignalScore(consumableSignals, [
    "explicit_memory_reference",
    "topic_continuity",
    "relationship_candidate",
  ]);
  const reflectionContextScore = maxSignalScore(consumableSignals, [
    "reflection_request",
  ]);
  const supportContextScore = maxSignalScore(consumableSignals, [
    "support_request",
    "distress",
    "negative_trend",
    "withdrawal_pattern",
  ]);
  const taskPressureScore = maxSignalScore(decisionSignals, [
    "time_pressure",
    "schedule_disruption",
    "missed_commitment",
  ]);
  const effectiveDistressContextScore = distressContextScore;
  const effectiveContinuityContextScore = continuityContextScore;
  const effectiveSupportContextScore = supportContextScore;

  const openLoops = activeTasks
    .filter((item) => Boolean(item.metadata.unresolved))
    .map((item) => ({
      id: item.id,
      summary: item.content,
      sourceStore: item.store,
    }));

  const constraints = [
    ...(emotionalState.length > 0 || effectiveDistressContextScore >= 0.55
      ? [
          buildConstraint({
            kind: "emotional_safety",
            content:
              effectiveDistressContextScore >= 0.7
                ? "Prioritize emotional steadiness, stay soft, and avoid pushing the user forward too quickly."
                : "Prioritize emotional steadiness and avoid sharp pushes.",
            sourceItems: emotionalState,
          }),
        ]
      : []),
    ...(openLoops.length > 0 ||
    planningContextScore >= 0.62 ||
    taskPressureScore >= 0.62
      ? [
          buildConstraint({
            kind: "task_continuity",
            content:
              taskPressureScore >= 0.62
                ? "Preserve continuity with unresolved commitments and keep imminent schedule pressure in view."
                : "Preserve continuity with unresolved commitments.",
            sourceItems: activeTasks.filter((item) =>
              Boolean(item.metadata.unresolved)
            ),
          }),
        ]
      : []),
    ...(relationshipState.length > 0 || continuityContextScore >= 0.58
      ? [
          buildConstraint({
            kind: "relationship_consistency",
            content:
              "Keep relationship references consistent with prior context.",
            sourceItems: relationshipState,
          }),
        ]
      : []),
    ...(worldFacts.length > 0
      ? [
          buildConstraint({
            kind: "knowledge_grounding",
            content:
              "Ground factual answers in retrieved world knowledge when relevant.",
            sourceItems: worldFacts,
          }),
        ]
      : []),
  ];

  const actionCandidates = [
    ...(emotionalState.length > 0 || effectiveSupportContextScore >= 0.5
      ? [
          buildActionCandidate({
            kind: "offer_supportive_followup",
            content:
              effectiveDistressContextScore >= 0.68
                ? "Offer a grounding supportive follow-up before shifting into execution."
                : "Offer a supportive follow-up before shifting into execution.",
            score: Math.max(0.72, effectiveSupportContextScore),
            sourceItems: emotionalState,
          }),
        ]
      : []),
    ...(openLoops.length > 0 || planningContextScore >= 0.62
      ? [
          buildActionCandidate({
            kind: "resolve_open_loop",
            content:
              taskPressureScore >= 0.62
                ? "Help resolve the most salient open loop while respecting imminent time pressure."
                : "Help resolve the most salient unresolved loop.",
            score: Math.max(0.73, planningContextScore, taskPressureScore),
            sourceItems: activeTasks.filter((item) =>
              Boolean(item.metadata.unresolved)
            ),
          }),
        ]
      : []),
    ...(worldFacts.length > 0
      ? [
          buildActionCandidate({
            kind: "ground_answer_in_world_facts",
            content: "Use retrieved world facts to ground the reply.",
            score: 0.68,
            sourceItems: worldFacts,
          }),
        ]
      : []),
    ...(relationshipState.length > 0 || continuityContextScore >= 0.58
      ? [
          buildActionCandidate({
            kind: "clarify_relationship_context",
            content:
              "Use relationship state to keep the reply relationally coherent.",
            score: Math.max(0.58, continuityContextScore),
            sourceItems: relationshipState,
          }),
        ]
      : []),
  ];

  const focus =
    emotionalState.length > 0 || effectiveDistressContextScore >= 0.58
      ? "support"
      : activeTasks.length > 0 || planningContextScore >= 0.62
        ? "planning"
        : relationshipState.length > 0 ||
            effectiveContinuityContextScore >= 0.58
          ? "continuity"
          : worldFacts.length > 0
            ? "knowledge"
            : personalContext.length > 0 || reflectionContextScore >= 0.55
              ? "reflection"
              : "open";

  return {
    focus,
    relationshipState,
    emotionalState,
    personalContext,
    activeTasks,
    openLoops,
    worldFacts,
    constraints,
    actionCandidates,
  };
};

export { buildWorkingMemory };
