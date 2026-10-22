import { createHash } from "node:crypto";
import type {
  Commitment,
  DecisionCandidate,
  Goal,
  PolicyResult,
} from "@neobuni/contracts";
import {
  buildNextActionCandidates,
  buildNextActionShadowDecision,
  selectHeuristicNextAction,
} from "@neobuni/core";
import { recordDecisionTrace } from "@neobuni/db";

import { Effect, tryPromise } from "../effect";
import {
  getConfiguredJevProvider,
  getJevRuntimeConfig,
} from "./jev-provider-config";

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
  const shadow = buildNextActionShadowDecision({ decisionId, candidates });
  const jevConfig = yield* tryPromise("getJevRuntimeConfig", () =>
    getJevRuntimeConfig(input.profileId)
  );
  const shouldRunJev = jevConfig?.metadata.nextActionShadowEnabled ?? false;
  const shadowRequest = shadow.request;
  const provider =
    shouldRunJev && shadowRequest
      ? yield* tryPromise("getConfiguredJevProvider", () =>
          getConfiguredJevProvider(input.profileId)
        )
      : null;
  const jevAttempt =
    provider && shadowRequest
      ? yield* tryPromise("jev.decide", () =>
          provider.decide(shadowRequest)
        ).pipe(
          Effect.match({
            onFailure: () => ({ result: null, status: "failed" as const }),
            onSuccess: (result) => ({ result, status: "answered" as const }),
          })
        )
      : {
          result: null,
          status: shouldRunJev
            ? ("unavailable" as const)
            : ("disabled" as const),
        };
  const jevResult = jevAttempt.result;
  const route = suggestedAction ? "suggest" : "stay_silent";
  const policyResult: PolicyResult = {
    permitted: true,
    route,
    reasons: [
      ...(suggestedAction
        ? ["advisory_next_action_only"]
        : ["no_eligible_candidate"]),
      ...(jevAttempt.status === "failed"
        ? ["jev_provider_error"]
        : jevAttempt.status === "unavailable"
          ? ["jev_provider_unavailable"]
          : jevAttempt.status === "disabled"
            ? ["jev_shadow_disabled"]
            : ["jev_shadow_observed"]),
    ],
    policyVersion: "decision-os-next-action-shadow-v1",
  };
  const decision = yield* recordDecisionTrace({
    decision: {
      id: decisionId,
      profileId: input.profileId,
      goalId: input.goalId ?? null,
      kind: "next_action",
      trigger: input.trigger,
      stateFingerprint: hashState(shadow.request?.state ?? { candidates: [] }),
      route,
      policyResult,
    },
    candidates,
    judgments: [
      ...shadow.heuristicAnswers.map((answer) => ({
        ...answer,
        provider: "heuristic" as const,
        providerVersion: "next-action-baseline-v1",
        latencyMs: 0,
      })),
      ...(jevResult
        ? jevResult.answers.map((answer) => ({
            ...answer,
            provider: "jev" as const,
            providerVersion: jevResult.providerVersion,
            latencyMs: jevResult.latencyMs,
          }))
        : []),
    ],
  });
  return { decision, suggestedAction, candidates } as {
    decision: typeof decision;
    suggestedAction: DecisionCandidate | null;
    candidates: DecisionCandidate[];
  };
});

export { recordNextActionEvaluation };
