import type {
  CompiledVoiceExpression,
  VoiceRenderSpec,
} from "@neobuni/contracts";

const renderVoiceExpression = (
  expression: CompiledVoiceExpression
): VoiceRenderSpec => {
  const stylePreset =
    expression.cadenceMode === "slow_grounded"
      ? "calm_grounded"
      : expression.cadenceMode === "clear_brisk"
        ? "clear_guiding"
        : "warm_supportive";

  const speakingRate =
    expression.cadenceMode === "slow_grounded"
      ? 0.9
      : expression.cadenceMode === "clear_brisk"
        ? 1.05
        : 0.98;

  const pauseMs =
    expression.pauseDensity === "supportive"
      ? 420
      : expression.pauseDensity === "sparse"
        ? 180
        : 280;

  const boundaryMode =
    expression.repairMode === "gentle_reassurance" ? "soft" : "steady";

  const repairPreface =
    expression.repairMode === "gentle_reassurance"
      ? "我们先慢一点。"
      : expression.repairMode === "confirm_then_continue"
        ? "我先接住你的意思。"
        : null;

  return {
    channel: "voice",
    stylePreset,
    speakingRate,
    pauseMs,
    boundaryMode,
    repairPreface,
  };
};

export { renderVoiceExpression };
