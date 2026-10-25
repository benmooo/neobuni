import { createHash } from "node:crypto";
import type {
  Commitment,
  DecisionCandidate,
  Goal,
  PolicyResult,
} from "@neobuni/contracts";
import {
  buildNextActionCandidates,
  selectHeuristicNextAction,
} from "@neobuni/core";
import { recordDecisionTrace } from "@neobuni/db";

import { Effect } from "../effect";

const hashState = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);

const recordNextActionEvaluation = Effect.fnUntraced(function* (input: {
  profileId: string;
  goals: Goal[];
  commitments: Commitment[];
  goalId?: string;
  trigger: string;
}) {
  const decisionId = crypto.randomUUID();
  const selectedGoals = input.goalId
    ? input.goals.filter((goal) => goal.id === input.goalId)
    : input.goals;
  const candidates = buildNextActionCandidates({
    goals: selectedGoals,
    commitments: input.commitments,
  });
  const suggestedAction = selectHeuristicNextAction(candidates);
  const route = suggestedAction ? "suggest" : "stay_silent";
  const policyResult: PolicyResult = {
    permitted: true,
    route,
    reasons: [
      suggestedAction ? "advisory_next_action_only" : "no_eligible_candidate",
    ],
    policyVersion: "decision-os-next-action-v2",
  };
  const decision = yield* recordDecisionTrace({
    decision: {
      id: decisionId,
      profileId: input.profileId,
      goalId: input.goalId ?? null,
      kind: "next_action",
      trigger: input.trigger,
      stateFingerprint: hashState({
        goalId: input.goalId ?? null,
        candidates,
      }),
      route,
      policyResult,
    },
    candidates,
  });
  return { decision, suggestedAction, candidates } as {
    decision: typeof decision;
    suggestedAction: DecisionCandidate | null;
    candidates: DecisionCandidate[];
  };
});

export { recordNextActionEvaluation };
