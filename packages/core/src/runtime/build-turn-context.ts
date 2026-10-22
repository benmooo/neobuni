import type {
	MemorySlice,
	PreviousRuntimeState,
	RuntimeTurnSignalInput,
	ScheduleSignalInput,
	TurnContext,
	TurnInput,
} from "@neobuni/contracts";

import { buildSignalSet } from "./build-signal-set";

const buildTurnContext = (input: {
	turnInput: TurnInput;
	recentUserTexts: string[];
	unresolvedSlices: MemorySlice[];
	recentSlices: MemorySlice[];
	signalContext: {
		schedules: ScheduleSignalInput[];
		recentRuntimeTurns: RuntimeTurnSignalInput[];
		environment: {
			effectiveTimezone: string;
		};
	};
	previousRuntimeState?: PreviousRuntimeState | null;
}): TurnContext => ({
	input: input.turnInput,
	recentUserTexts: input.recentUserTexts,
	signals: buildSignalSet({
		latestUserText: input.turnInput.latestUserText,
		recentUserTexts: input.recentUserTexts,
		unresolvedSlices: input.unresolvedSlices,
		recentSlices: input.recentSlices,
		schedules: input.signalContext.schedules,
		recentRuntimeTurns: input.signalContext.recentRuntimeTurns,
		effectiveTimezone: input.signalContext.environment.effectiveTimezone,
		now: input.turnInput.now,
	}),
	signalContext: {
		...input.signalContext,
	},
	unresolvedSlices: input.unresolvedSlices,
	recentSlices: input.recentSlices,
	previousRuntimeState: input.previousRuntimeState ?? null,
});

export { buildTurnContext };
