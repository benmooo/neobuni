import type { DecisionRoute, PolicyResult } from "@neobuni/contracts";

type ComposeDecisionRouteInput = {
	policyVersion: string;
	hardPolicyPermitted: boolean;
	authorityGranted: boolean;
	confidence: number | null;
	confidenceThreshold: number;
	interruptionValue: number;
	interruptionThreshold: number;
	reversibility: "reversible" | "partially_reversible" | "irreversible";
};

const composeDecisionRoute = (
	input: ComposeDecisionRouteInput
): PolicyResult => {
	if (!input.hardPolicyPermitted) {
		return {
			permitted: false,
			route: "deny",
			reasons: ["hard_policy_denied"],
			policyVersion: input.policyVersion,
		};
	}
	if (!input.authorityGranted) {
		return {
			permitted: true,
			route: "request_confirmation",
			reasons: ["authority_required"],
			policyVersion: input.policyVersion,
		};
	}
	if (
		input.confidence === null ||
		input.confidence < input.confidenceThreshold
	) {
		return {
			permitted: true,
			route: "use_system_two",
			reasons: ["insufficient_judgment_confidence"],
			policyVersion: input.policyVersion,
		};
	}
	if (input.interruptionValue < input.interruptionThreshold) {
		return {
			permitted: true,
			route: "stay_silent",
			reasons: ["low_interruption_value"],
			policyVersion: input.policyVersion,
		};
	}
	const route: DecisionRoute =
		input.reversibility === "reversible" ? "execute" : "suggest";
	return {
		permitted: true,
		route,
		reasons: ["authorized_high_confidence_candidate"],
		policyVersion: input.policyVersion,
	};
};

export type { ComposeDecisionRouteInput };
export { composeDecisionRoute };
