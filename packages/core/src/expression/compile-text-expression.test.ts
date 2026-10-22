import { describe, expect, test } from "vitest";

import type { TextExpressionCompilerInput } from "@neobuni/contracts";

import { compileTextExpression } from "./compile-text-expression";

const baseInput: TextExpressionCompilerInput = {
  channel: "text",
  responseSpec: {
    goal: "stay_present",
    stance: "comforting",
    tone: ["warm", "steady"],
    mustAvoid: ["pressure_for_connection"],
    intimacyCap: "subtle",
    verbosity: "medium",
    shouldAskFollowup: true,
    shouldSuggestAction: true,
    toolPolicy: "allow",
  },
  context: {
    userIntent: "support",
    emotionalLoad: "high",
    vulnerability: "high",
    protectiveLevel: 2,
    primaryStance: "protective",
    workingMemoryFocus: "support",
  },
  signalDrivers: [
    {
      kind: "distress_language",
      score: 0.92,
      strengthBand: "strong",
      consumptionMode: "decision_input",
    },
    {
      kind: "negative_trend",
      score: 0.66,
      strengthBand: "medium",
      consumptionMode: "context_hint",
    },
  ],
};

describe("compileTextExpression", () => {
  test("compiles protective support turns into grounded text plans", () => {
    const result = compileTextExpression(baseInput);

    expect(result.openingMode).toBe("grounding_first");
    expect(result.bodyMode).toBe("balanced");
    expect(result.closingMode).toBe("gentle_handoff");
    expect(result.followupMode).toBe("check_state_first");
    expect(result.suggestionMode).toBe("tentative");
    expect(result.toolUseMode).toBe("available_if_needed");
    expect(result.toneDirectives).toEqual(["warm", "steady"]);
    expect(result.forbiddenMoves).toEqual(["pressure_for_connection"]);
    expect(result.renderHints).toContain("driver:distress_language");
  });

  test("compiles planning turns into direct answer text plans", () => {
    const result = compileTextExpression({
      ...baseInput,
      responseSpec: {
        ...baseInput.responseSpec,
        goal: "gently_mobilize",
        stance: "mobilizing",
        verbosity: "low",
        shouldAskFollowup: false,
        shouldSuggestAction: false,
        toolPolicy: "prefer",
      },
      context: {
        ...baseInput.context,
        userIntent: "planning",
        emotionalLoad: "low",
        vulnerability: "low",
        protectiveLevel: 0,
        primaryStance: "mobilizing",
        workingMemoryFocus: "planning",
      },
      signalDrivers: [
        {
          kind: "time_pressure",
          score: 0.73,
          strengthBand: "strong",
          consumptionMode: "decision_input",
        },
      ],
    });

    expect(result.openingMode).toBe("direct_answer_first");
    expect(result.bodyMode).toBe("concise");
    expect(result.closingMode).toBe("soft_open");
    expect(result.followupMode).toBe("none");
    expect(result.suggestionMode).toBe("none");
    expect(result.toolUseMode).toBe("proactively_offer");
    expect(result.renderHints).toContain("focus:planning");
    expect(result.renderHints).toContain("driver:time_pressure");
  });
});
