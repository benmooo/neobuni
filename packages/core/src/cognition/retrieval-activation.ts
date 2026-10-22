import type {
  RetrievalIntent,
  RetrievalIntentProfile,
  StoreActivationDecision,
  StoreActivationPlan,
} from "@neobuni/contracts"

import type { RetrievalSignals } from "./retrieval-signals"
import { clampScore } from "./retrieval-shared"

const toActivationMode = (
  score: number,
  thresholds: {
    prefetch: number
    deferToTool: number
  },
): StoreActivationDecision["mode"] => {
  if (score >= thresholds.prefetch) {
    return "prefetch"
  }

  if (score >= thresholds.deferToTool) {
    return "defer_to_tool"
  }

  return "skip"
}

const planStoreActivation = (input: {
  primaryIntent: RetrievalIntent
  intentProfile: RetrievalIntentProfile
  signals: RetrievalSignals
}): StoreActivationPlan => {
  const temporalScore = clampScore(
    Math.max(
      input.intentProfile.personalHistory,
      input.intentProfile.taskState * 0.84,
      input.signals.explicitPersonalReferenceScore * 0.7 +
        input.signals.unresolvedOverlapScore * 0.24 +
        input.signals.recentOverlapScore * 0.18,
    ),
  )
  const graphScore = clampScore(
    input.signals.relationshipLookupScore > 0
      ? input.intentProfile.relationshipState
      : 0,
  )
  const knowledgeScore = clampScore(
    Math.max(
      input.intentProfile.worldKnowledge,
      input.primaryIntent === "hybrid"
        ? input.signals.worldKnowledgeScore * 0.74
        : 0,
    ),
  )

  const temporal: StoreActivationDecision = {
    mode: toActivationMode(temporalScore, {
      prefetch: 0.72,
      deferToTool: 0.35,
    }),
    score: temporalScore,
    reasons: [
      input.signals.explicitPersonalReferenceScore > 0
        ? "explicit_personal_reference"
        : null,
      input.intentProfile.personalHistory >= 0.5
        ? "personal_history_need"
        : null,
      input.intentProfile.taskState >= 0.52 ? "task_state_need" : null,
      input.signals.unresolvedOverlapScore >= 0.34
        ? "unresolved_overlap"
        : null,
      input.signals.recentOverlapScore >= 0.34 ? "recent_overlap" : null,
    ].filter((reason): reason is string => reason !== null),
  }

  const graph: StoreActivationDecision = {
    mode: toActivationMode(graphScore, {
      prefetch: 0.5,
      deferToTool: 0.32,
    }),
    score: graphScore,
    reasons: [
      input.intentProfile.relationshipState >= 0.45
        ? "relationship_state_need"
        : null,
      input.intentProfile.taskState >= 0.5 ? "task_state_need" : null,
      input.intentProfile.topicContinuity >= 0.34
        ? "topic_continuity_need"
        : null,
      input.signals.relationshipLookupScore > 0 ? "relationship_lookup" : null,
    ].filter((reason): reason is string => reason !== null),
  }

  const knowledge: StoreActivationDecision = {
    mode: toActivationMode(knowledgeScore, {
      prefetch: 0.62,
      deferToTool: 0.34,
    }),
    score: knowledgeScore,
    reasons: [
      input.intentProfile.worldKnowledge >= 0.45
        ? "world_knowledge_need"
        : null,
      input.signals.worldKnowledgeScore > 0 ? "world_knowledge_signal" : null,
    ].filter((reason): reason is string => reason !== null),
  }

  return {
    temporal,
    graph,
    knowledge,
  }
}

export { planStoreActivation }
