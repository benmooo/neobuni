import type {
  RetrievalIntent,
  RetrievalIntentProfile,
} from "@neobuni/contracts";
import { clampScore } from "./retrieval-shared";
import type { RetrievalSignals } from "./retrieval-signals";

const classifyRetrievalIntents = (
  signals: RetrievalSignals
): {
  primaryIntent: RetrievalIntent;
  intentProfile: RetrievalIntentProfile;
} => {
  const personalHistory = clampScore(
    Math.max(
      signals.explicitPersonalReferenceScore,
      signals.explicitPersonalReferenceScore * 0.55 +
        signals.autobiographicalIntentScore * 0.22 +
        signals.unresolvedOverlapScore * 0.28 +
        signals.recentOverlapScore * 0.18 +
        signals.continuityScore * 0.12
    )
  );
  const relationshipState = clampScore(
    signals.relationshipLookupScore * 0.72 +
      signals.explicitPersonalReferenceScore * 0.18 +
      signals.recentOverlapScore * 0.12 +
      signals.unresolvedOverlapScore * 0.08
  );
  const taskState = clampScore(
    signals.taskFollowupScore * 0.52 +
      signals.autobiographicalIntentScore * 0.18 +
      signals.unresolvedOverlapScore * 0.22 +
      signals.recentOverlapScore * 0.12 +
      signals.continuityScore * 0.16
  );
  const topicContinuity = clampScore(
    signals.continuityScore * 0.6 +
      signals.recentOverlapScore * 0.28 +
      signals.unresolvedOverlapScore * 0.12
  );
  const worldKnowledge = clampScore(
    signals.relationshipLookupScore > 0
      ? 0
      : signals.worldKnowledgeScore * 0.82 +
          (signals.explicitPersonalReferenceScore > 0
            ? 0
            : signals.recentOverlapScore * 0.05)
  );

  const intentProfile: RetrievalIntentProfile = {
    personalHistory,
    relationshipState,
    taskState,
    topicContinuity,
    worldKnowledge,
  };

  const ranked = [
    ["personal_history", intentProfile.personalHistory],
    ["relationship_state", intentProfile.relationshipState],
    ["task_state", intentProfile.taskState],
    ["topic_continuity", intentProfile.topicContinuity],
    ["world_knowledge", intentProfile.worldKnowledge],
  ] as const;
  const sorted = [...ranked].sort((left, right) => right[1] - left[1]);
  const best = sorted[0];

  if (!best) {
    return {
      primaryIntent: "hybrid",
      intentProfile,
    };
  }

  const [bestIntent, bestScore] = best;
  const secondScore = sorted[1]?.[1] ?? 0;

  if (bestScore < 0.35) {
    return {
      primaryIntent: "hybrid",
      intentProfile,
    };
  }

  if (bestScore - secondScore < 0.07 && bestScore < 0.65) {
    return {
      primaryIntent: "hybrid",
      intentProfile,
    };
  }

  return {
    primaryIntent: bestIntent,
    intentProfile,
  };
};

export { classifyRetrievalIntents };
