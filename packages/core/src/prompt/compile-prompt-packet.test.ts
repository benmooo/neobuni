import type { CompiledExpressionSet } from "@neobuni/contracts";
import { describe, expect, test } from "vitest";

import { compilePromptPacket } from "./compile-prompt-packet";

const expressionSet: CompiledExpressionSet = {
  text: {
    channel: "text",
    openingMode: "direct_answer_first",
    bodyMode: "balanced",
    closingMode: "soft_open",
    followupMode: "gentle_question",
    suggestionMode: "direct",
    toolUseMode: "available_if_needed",
    toolPolicy: "allow",
    toneDirectives: ["warm"],
    forbiddenMoves: ["pressure_for_connection"],
    renderHints: ["focus:planning"],
  },
  voice: {
    channel: "voice",
    cadenceMode: "steady_warm",
    affectMode: "warm_neutral",
    pauseDensity: "balanced",
    emphasisBudget: "medium",
    repairMode: "confirm_then_continue",
    toneDirectives: ["warm"],
    forbiddenMoves: ["pressure_for_connection"],
    renderHints: ["cadence:steady_warm"],
  },
  ui: {
    channel: "ui",
    messageFrame: "plan_outline",
    ctaMode: "primary_and_secondary",
    cardDensity: "balanced",
    alertStyle: "none",
    composerMode: "followup_invite",
    toneDirectives: ["warm"],
    forbiddenMoves: ["pressure_for_connection"],
    renderHints: ["frame:plan_outline"],
  },
};

describe("compilePromptPacket", () => {
  test("builds a structured prompt packet and keeps compiled expression attached", () => {
    const result = compilePromptPacket({
      aiName: "Buni",
      userName: "Aka",
      userPersona: "builder",
      expressionSet,
      goalContext: {
        activeGoals: [
          {
            id: "goal-1",
            title: "Ship decision OS",
            desiredOutcome: "A working goal-centered agent",
            horizon: "project",
          },
        ],
        openCommitments: [
          {
            goalId: "goal-1",
            title: "Review Jev results",
            status: "open",
            dueAt: null,
          },
        ],
      },
      workingMemory: {
        focus: "planning",
        relationshipState: [],
        emotionalState: [],
        personalContext: [],
        activeTasks: [],
        openLoops: [],
        worldFacts: [],
        constraints: [],
        actionCandidates: [],
      },
    });

    expect(result.sections.some((section) => section.key === "identity")).toBe(
      true
    );
    expect(
      result.sections.some((section) => section.key === "text_expression")
    ).toBe(true);
    expect(
      result.sections.some((section) => section.key === "tool_semantics")
    ).toBe(true);
    expect(
      result.sections.some((section) => section.key === "goal_context")
    ).toBe(true);
    expect(result.systemPrompt.includes("Text expression plan:")).toBe(true);
    expect(result.systemPrompt.includes("Do not claim a rebuild")).toBe(true);
    expect(result.systemPrompt.includes("Ship decision OS")).toBe(true);
    expect(result.compiledExpression?.ui.messageFrame).toBe("plan_outline");
  });
});
