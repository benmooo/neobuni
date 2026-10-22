import type {
  CompiledVoiceExpression,
  VoiceExpressionCompilerInput,
} from "@neobuni/contracts";

const compileVoiceExpression = (
  input: VoiceExpressionCompilerInput
): CompiledVoiceExpression => {
  const cadenceMode =
    input.context.protectiveLevel >= 2 || input.context.emotionalLoad === "high"
      ? "slow_grounded"
      : input.context.userIntent === "planning"
        ? "clear_brisk"
        : "steady_warm";

  const affectMode =
    input.context.userIntent === "planning"
      ? "light_encouraging"
      : input.context.protectiveLevel >= 1 ||
          input.context.userIntent === "support"
        ? "soothing"
        : "warm_neutral";

  const pauseDensity =
    input.context.protectiveLevel >= 2
      ? "supportive"
      : input.context.userIntent === "planning"
        ? "sparse"
        : "balanced";

  const emphasisBudget =
    input.responseSpec.verbosity === "high" ||
    input.context.userIntent === "planning"
      ? "medium"
      : "low";

  const repairMode =
    input.context.protectiveLevel >= 2
      ? "gentle_reassurance"
      : input.responseSpec.shouldAskFollowup
        ? "confirm_then_continue"
        : "none";

  return {
    channel: "voice",
    cadenceMode,
    affectMode,
    pauseDensity,
    emphasisBudget,
    repairMode,
    toneDirectives: input.responseSpec.tone,
    forbiddenMoves: input.responseSpec.mustAvoid,
    renderHints: [
      `stance:${input.context.primaryStance}`,
      `focus:${input.context.workingMemoryFocus}`,
      `cadence:${cadenceMode}`,
      `affect:${affectMode}`,
      ...input.signalDrivers
        .slice(0, 2)
        .map((signal) => `driver:${signal.kind}`),
    ],
  };
};

export { compileVoiceExpression };
