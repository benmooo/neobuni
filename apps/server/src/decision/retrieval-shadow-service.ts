import { createHash } from "node:crypto";
import type { RetrievalPlan } from "@neobuni/contracts";
import {
	applyJevRetrievalSuppression,
	buildRetrievalShadowDecision,
	evaluateDecisionReleaseGate,
	routableRetrievalQuestionIds,
	summarizeDecisionEvaluation,
} from "@neobuni/core";
import { listDecisionTracesByProfile, recordDecisionTrace } from "@neobuni/db";
import { Effect, tryPromise } from "../effect";
import {
	getConfiguredJevProvider,
	getJevRuntimeConfig,
} from "./jev-provider-config";
import { createRetrievalReleaseGateConfig } from "./retrieval-release-config";

const hashState = (value: unknown) =>
	createHash("sha256")
		.update(JSON.stringify(value))
		.digest("hex")
		.slice(0, 32);

const evaluateRetrievalDecision = Effect.fnUntraced(function* (input: {
	profileId: string;
	latestUserText: string;
	retrievalPlan: RetrievalPlan;
	trigger: string;
}) {
	const decisionId = crypto.randomUUID();
	const shadow = buildRetrievalShadowDecision({
		decisionId,
		latestUserText: input.latestUserText,
		retrievalPlan: input.retrievalPlan,
	});
	const jevConfig = yield* tryPromise("getJevRuntimeConfig", () =>
		getJevRuntimeConfig(input.profileId)
	);
	const graphV2ShadowEnabled =
		jevConfig?.metadata.graphV2ShadowEnabled ?? false;
	const shadowWithConfiguredQuestions = graphV2ShadowEnabled
		? buildRetrievalShadowDecision({
				decisionId,
				latestUserText: input.latestUserText,
				retrievalPlan: input.retrievalPlan,
				includeGraphV2Shadow: true,
			})
		: shadow;
	const shadowMode = jevConfig?.metadata.retrievalShadowEnabled ?? false;
	const routingMode = jevConfig?.metadata.retrievalRoutingEnabled ?? false;
	const provider =
		shadowMode || routingMode
			? yield* tryPromise("getConfiguredJevProvider", () =>
					getConfiguredJevProvider(input.profileId)
				)
			: null;
	const jevAttempt = provider
		? yield* tryPromise("jev.decide", () =>
				provider.decide(shadowWithConfiguredQuestions.request)
			).pipe(
				Effect.match({
					onFailure: () => ({ result: null, status: "failed" as const }),
					onSuccess: (result) => ({ result, status: "answered" as const }),
				})
			)
		: { result: null, status: "unavailable" as const };
	const jevResult = jevAttempt.result;
	const confidenceThreshold =
		jevConfig?.metadata.retrievalConfidenceThreshold ?? 0.85;
	const retrievalTraces = routingMode
		? (yield* listDecisionTracesByProfile(input.profileId)).filter(
				(trace) => trace.decision.kind === "memory_retrieval"
			)
		: [];
	const releaseGate = evaluateDecisionReleaseGate({
		summary: summarizeDecisionEvaluation(retrievalTraces, {
			questionIds: routableRetrievalQuestionIds,
		}),
		...createRetrievalReleaseGateConfig({
			minComparedPairs: jevConfig?.metadata.retrievalMinComparedPairs ?? 20,
			minAgreementRate: jevConfig?.metadata.retrievalMinAgreementRate ?? 0.85,
			maxAverageJevLatencyMs:
				jevConfig?.metadata.retrievalMaxAverageLatencyMs ?? 3000,
			maxProviderErrorRate:
				jevConfig?.metadata.retrievalMaxProviderErrorRate ?? 0.05,
		}),
	});
	const routing =
		routingMode &&
		releaseGate.passed &&
		jevResult &&
		Number.isFinite(confidenceThreshold)
			? applyJevRetrievalSuppression({
					retrievalPlan: input.retrievalPlan,
					answers: jevResult.answers,
					confidenceThreshold,
				})
			: { retrievalPlan: input.retrievalPlan, appliedQuestionIds: [] };
	if (!(shadowMode || routingMode)) {
		return routing;
	}
	yield* recordDecisionTrace({
		decision: {
			id: decisionId,
			profileId: input.profileId,
			goalId: null,
			kind: "memory_retrieval",
			trigger: input.trigger,
			stateFingerprint: hashState(shadowWithConfiguredQuestions.request.state),
			route: "stay_silent",
			policyResult: {
				permitted: true,
				route: "stay_silent",
				reasons:
					routing.appliedQuestionIds.length > 0
						? ["jev_high_confidence_retrieval_suppression"]
						: jevAttempt.status === "failed"
							? ["jev_provider_error"]
							: routingMode && !releaseGate.passed
								? ["retrieval_routing_release_gate_not_met"]
								: jevAttempt.status === "unavailable"
									? ["jev_provider_unavailable"]
									: ["jev_shadow_observed_no_behavior_change"],
				policyVersion: "decision-os-retrieval-routing-v1",
			},
		},
		candidates: shadowWithConfiguredQuestions.candidates,
		judgments: [
			...shadowWithConfiguredQuestions.heuristicAnswers.map((answer) => ({
				...answer,
				provider: "heuristic" as const,
				providerVersion: "retrieval-plan-v1",
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
	return routing;
});

export { evaluateRetrievalDecision };
