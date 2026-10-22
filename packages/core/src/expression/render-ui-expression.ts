import type {
	CompiledUiExpression,
	ExpressionContext,
	ResponseSpec,
	UiRenderSpec,
	UiSuggestedAction,
} from "@neobuni/contracts";

const buildSuggestedActions = (input: {
	expression: CompiledUiExpression;
	context: ExpressionContext;
	responseSpec: ResponseSpec;
}): UiSuggestedAction[] => {
	if (input.expression.ctaMode === "none") {
		return [];
	}

	if (input.expression.messageFrame === "plan_outline") {
		return [
			{
				id: "break_plan_into_steps",
				label: "拆成步骤",
				prompt: "那就帮我把这件事拆成几个具体步骤。",
			},
			{
				id: "set_reminder",
				label: "顺手设提醒",
				prompt: "可以的话也顺手帮我想一下要不要设个提醒。",
			},
		];
	}

	if (input.expression.messageFrame === "support_panel") {
		return [
			{
				id: "continue_sharing",
				label: "继续说说",
				prompt: "我可以继续说，你先接着听我讲。",
			},
			{
				id: "help_me_sort",
				label: "帮我理一下",
				prompt: "你帮我把现在最乱的部分理一理。",
			},
		];
	}

	if (input.expression.messageFrame === "reflective_prompt") {
		return [
			{
				id: "go_deeper",
				label: "继续展开",
				prompt: "那我们就沿着这个点再往下展开一点。",
			},
		];
	}

	return input.responseSpec.shouldAskFollowup
		? [
				{
					id: "follow_up",
					label: "继续补充",
					prompt: "我再补充一点刚才那件事。",
				},
			]
		: [];
};

const renderUiExpression = (input: {
	expression: CompiledUiExpression;
	context: ExpressionContext;
	responseSpec: ResponseSpec;
}): UiRenderSpec => {
	const bubbleVariant =
		input.expression.messageFrame === "support_panel"
			? "support"
			: input.expression.messageFrame === "plan_outline"
				? "plan"
				: input.expression.messageFrame === "reflective_prompt"
					? "reflection"
					: "default";

	const alertTone =
		input.expression.alertStyle === "protective_notice"
			? "protective"
			: input.expression.alertStyle === "gentle_notice"
				? "gentle"
				: "none";

	const alertTitle =
		input.expression.alertStyle === "protective_notice"
			? "先不要着急推进"
			: input.expression.alertStyle === "gentle_notice"
				? "可以慢一点"
				: null;

	const alertBody =
		input.expression.alertStyle === "protective_notice"
			? "这一轮更适合先稳住感受，再决定要不要继续行动。"
			: input.expression.alertStyle === "gentle_notice"
				? "如果你愿意，可以先补一句你现在最在意的部分。"
				: null;

	const composerPlaceholder =
		input.expression.composerMode === "guided_checkin"
			? "如果你愿意，可以先说现在最难受的那一块"
			: input.expression.composerMode === "followup_invite"
				? "你可以继续补充，我会顺着接住"
				: input.context.userIntent === "planning"
					? "把你想推进的目标再说具体一点"
					: "说点什么…";

	return {
		channel: "ui",
		bubbleVariant,
		alertTone,
		alertTitle,
		alertBody,
		composerPlaceholder,
		suggestedActions: buildSuggestedActions(input),
	};
};

export { renderUiExpression };
