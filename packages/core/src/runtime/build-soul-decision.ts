import type {
	PreviousRuntimeState,
	ResponseSpec,
	SignalSet,
	SoulConfig,
} from "@neobuni/contracts";

import {
	buildSoulRuntimeState,
	type SoulRuntimeState,
} from "../soul/soul-runtime";

type RuntimeMemory = {
	content: string;
	type: string;
	keywords: string[];
};

const buildSoulDecision = (input: {
	soulConfig: SoulConfig;
	latestUserText: string;
	recentUserTexts: string[];
	recentAssistantTexts?: string[];
	signals: SignalSet;
	memories?: RuntimeMemory[];
	previousRuntimeState?: PreviousRuntimeState | null;
}): {
	soulRuntime: SoulRuntimeState;
	responseSpec: ResponseSpec;
} => {
	const soulRuntime = buildSoulRuntimeState({
		soulConfig: input.soulConfig,
		latestUserText: input.latestUserText,
		recentUserTexts: input.recentUserTexts,
		recentAssistantTexts: input.recentAssistantTexts,
		signals: input.signals,
		memories: input.memories,
		previousProtectiveState:
			input.previousRuntimeState?.protectiveLevel !== null &&
			input.previousRuntimeState?.protectiveLevel !== undefined
				? {
						// Prior runtime state is persisted as a bounded integer.
						level: input.previousRuntimeState.protectiveLevel as 0 | 1 | 2 | 3,
						stableTurnsSinceLastEscalation: 0,
						lastEscalationReasons: [],
					}
				: undefined,
	});

	return {
		soulRuntime,
		responseSpec: soulRuntime.responsePlan,
	};
};

export { buildSoulDecision };
