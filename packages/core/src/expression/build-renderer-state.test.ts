import { describe, expect, test } from "vitest";

import type { CompiledExpressionSet, ExpressionContext, ResponseSpec } from "@neobuni/contracts";

import { buildRendererState } from "./build-renderer-state";

const expressionSet: CompiledExpressionSet = {
  text: {
    channel: "text",
    openingMode: "grounding_first",
    bodyMode: "balanced",
    closingMode: "explicit_followup",
    followupMode: "check_state_first",
    suggestionMode: "tentative",
    toolUseMode: "available_if_needed",
    toolPolicy: "allow",
    toneDirectives: ["warm", "steady"],
    forbiddenMoves: ["pressure_for_connection"],
    renderHints: ["focus:support"],
  },
  voice: {
    channel: "voice",
    cadenceMode: "slow_grounded",
    affectMode: "soothing",
    pauseDensity: "supportive",
    emphasisBudget: "low",
    repairMode: "gentle_reassurance",
    toneDirectives: ["warm", "steady"],
    forbiddenMoves: ["pressure_for_connection"],
    renderHints: ["driver:distress_language"],
  },
  ui: {
    channel: "ui",
    messageFrame: "support_panel",
    ctaMode: "soft_actions",
    cardDensity: "balanced",
    alertStyle: "protective_notice",
    composerMode: "guided_checkin",
    toneDirectives: ["warm", "steady"],
    forbiddenMoves: ["pressure_for_connection"],
    renderHints: ["frame:support_panel"],
  },
};

const context: ExpressionContext = {
  userIntent: "support",
  emotionalLoad: "high",
  vulnerability: "high",
  protectiveLevel: 2,
  primaryStance: "protective",
  workingMemoryFocus: "support",
};

const responseSpec: ResponseSpec = {
  goal: "stay_present",
  stance: "protective",
  tone: ["warm", "steady"],
  mustAvoid: ["pressure_for_connection"],
  intimacyCap: "subtle",
  verbosity: "medium",
  shouldAskFollowup: true,
  shouldSuggestAction: true,
  toolPolicy: "allow",
};

describe("buildRendererState", () => {
  test("turns compiled voice and ui plans into renderer-facing specs", () => {
    const result = buildRendererState({
      expressionSet,
      context,
      responseSpec,
    });

    expect(result.voice.stylePreset).toBe("calm_grounded");
    expect(result.voice.repairPreface).toBe("我们先慢一点。");
    expect(result.ui.bubbleVariant).toBe("support");
    expect(result.ui.alertTone).toBe("protective");
    expect(result.ui.composerPlaceholder).toContain("最难受");
    expect(result.ui.suggestedActions.length).toBeGreaterThan(0);
  });
});
