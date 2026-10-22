import type {
	CompiledTextExpression,
	TextExpressionCompilerInput,
	TextToolUseMode,
} from "@neobuni/contracts";

const compileTextExpression = (
	input: TextExpressionCompilerInput
): CompiledTextExpression => {
	const openingMode =
		input.context.protectiveLevel >= 2 || input.context.emotionalLoad === "high"
			? "grounding_first"
			: input.context.userIntent === "support"
				? "check_in_first"
				: input.context.userIntent === "planning"
					? "direct_answer_first"
					: input.context.userIntent === "reflection"
						? "empathetic_first"
						: "check_in_first";

	const bodyMode =
		input.responseSpec.verbosity === "low"
			? "concise"
			: input.responseSpec.verbosity === "high"
				? "layered"
				: "balanced";

	const closingMode = input.responseSpec.shouldSuggestAction
		? "gentle_handoff"
		: input.responseSpec.shouldAskFollowup
			? "explicit_followup"
			: input.context.userIntent === "support"
				? "supportive_close"
				: "soft_open";

	const followupMode = input.responseSpec.shouldAskFollowup
		? input.context.protectiveLevel >= 1 ||
			input.context.userIntent === "support"
			? "check_state_first"
			: "gentle_question"
		: "none";

	const suggestionMode = input.responseSpec.shouldSuggestAction
		? input.context.protectiveLevel >= 2
			? "tentative"
			: "direct"
		: "none";

	const toolUseMode: TextToolUseMode =
		input.responseSpec.toolPolicy === "avoid"
			? "avoid"
			: input.responseSpec.toolPolicy === "prefer"
				? "proactively_offer"
				: "available_if_needed";

	const renderHints = [
		`focus:${input.context.workingMemoryFocus}`,
		`stance:${input.context.primaryStance}`,
		`opening:${openingMode}`,
		`body:${bodyMode}`,
		`closing:${closingMode}`,
		`followup:${followupMode}`,
		`suggestion:${suggestionMode}`,
		`tool_use:${toolUseMode}`,
		...input.signalDrivers.slice(0, 3).map((signal) => `driver:${signal.kind}`),
	];

	return {
		channel: "text",
		openingMode,
		bodyMode,
		closingMode,
		followupMode,
		suggestionMode,
		toolUseMode,
		toolPolicy: input.responseSpec.toolPolicy,
		toneDirectives: input.responseSpec.tone,
		forbiddenMoves: input.responseSpec.mustAvoid,
		renderHints,
	};
};

export { compileTextExpression };
