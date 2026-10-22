import type {
  CompiledUiExpression,
  UiExpressionCompilerInput,
} from "@neobuni/contracts";

const compileUiExpression = (
  input: UiExpressionCompilerInput,
): CompiledUiExpression => {
  const messageFrame =
    input.context.protectiveLevel >= 2 || input.context.userIntent === "support"
      ? "support_panel"
      : input.context.userIntent === "planning"
        ? "plan_outline"
        : input.context.userIntent === "reflection"
          ? "reflective_prompt"
          : "plain_reply";

  const ctaMode =
    !input.responseSpec.shouldSuggestAction && !input.responseSpec.shouldAskFollowup
      ? "none"
      : input.responseSpec.shouldSuggestAction
        ? "primary_and_secondary"
        : "soft_actions";

  const cardDensity =
    input.responseSpec.verbosity === "high"
      ? "rich"
      : input.responseSpec.verbosity === "low"
        ? "minimal"
        : "balanced";

  const alertStyle =
    input.context.protectiveLevel >= 2
      ? "protective_notice"
      : input.context.protectiveLevel >= 1
        ? "gentle_notice"
        : "none";

  const composerMode =
    input.context.protectiveLevel >= 2
      ? "guided_checkin"
      : input.responseSpec.shouldAskFollowup
        ? "followup_invite"
        : "default";

  return {
    channel: "ui",
    messageFrame,
    ctaMode,
    cardDensity,
    alertStyle,
    composerMode,
    toneDirectives: input.responseSpec.tone,
    forbiddenMoves: input.responseSpec.mustAvoid,
    renderHints: [
      `focus:${input.context.workingMemoryFocus}`,
      `frame:${messageFrame}`,
      `cta:${ctaMode}`,
      `alert:${alertStyle}`,
      ...input.signalDrivers.slice(0, 2).map((signal) => `driver:${signal.kind}`),
    ],
  };
};

export { compileUiExpression };
