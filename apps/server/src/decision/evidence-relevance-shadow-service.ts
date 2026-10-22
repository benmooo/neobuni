import { createHash } from "node:crypto";
import type { EvidenceItem } from "@neobuni/contracts";
import { buildEvidenceRelevanceShadowDecision } from "@neobuni/core";
import { recordDecisionTrace } from "@neobuni/db";
import { Effect, tryPromise } from "../effect";
import {
  getConfiguredJevProvider,
  getJevRuntimeConfig,
} from "./jev-provider-config";

const hashState = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);

const recordEvidenceRelevanceShadow = Effect.fnUntraced(function* (input: {
  profileId: string;
  latestUserText: string;
  evidence: EvidenceItem[];
  trigger: string;
}) {
  const config = yield* tryPromise("getJevRuntimeConfig", () =>
    getJevRuntimeConfig(input.profileId)
  );
  if (!config?.metadata.evidenceRelevanceShadowEnabled) {
    return { status: "disabled" as const, evidenceIds: [] as string[] };
  }
  const decisionId = crypto.randomUUID();
  const shadow = buildEvidenceRelevanceShadowDecision({
    decisionId,
    latestUserText: input.latestUserText,
    evidence: input.evidence,
  });
  if (shadow.heuristicAnswers.length === 0) {
    return { status: "no_evidence" as const, evidenceIds: [] as string[] };
  }
  const provider = yield* tryPromise("getConfiguredJevProvider", () =>
    getConfiguredJevProvider(input.profileId)
  );
  const attempt = provider
    ? yield* tryPromise("jev.decide", () =>
        provider.decide(shadow.request)
      ).pipe(
        Effect.match({
          onFailure: () => ({ result: null, status: "failed" as const }),
          onSuccess: (result) => ({ result, status: "answered" as const }),
        })
      )
    : { result: null, status: "unavailable" as const };
  yield* recordDecisionTrace({
    decision: {
      id: decisionId,
      profileId: input.profileId,
      goalId: null,
      kind: "memory_retrieval",
      trigger: input.trigger,
      stateFingerprint: hashState(shadow.request.state),
      route: "stay_silent",
      policyResult: {
        permitted: true,
        route: "stay_silent",
        reasons:
          attempt.status === "failed"
            ? ["jev_provider_error"]
            : attempt.status === "unavailable"
              ? ["jev_provider_unavailable"]
              : ["jev_shadow_observed_no_behavior_change"],
        policyVersion: "decision-os-evidence-relevance-shadow-v1",
      },
    },
    candidates: [],
    judgments: [
      ...shadow.heuristicAnswers.map((answer) => ({
        ...answer,
        provider: "heuristic" as const,
        providerVersion: "deterministic-evidence-score-v1",
        latencyMs: 0,
      })),
      ...(attempt.result
        ? attempt.result.answers.map((answer) => ({
            ...answer,
            provider: "jev" as const,
            providerVersion: attempt.result.providerVersion,
            latencyMs: attempt.result.latencyMs,
          }))
        : []),
    ],
  });
  return { status: attempt.status, evidenceIds: shadow.evidenceIds };
});

export { recordEvidenceRelevanceShadow };
