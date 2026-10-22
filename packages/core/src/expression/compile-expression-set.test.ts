import { describe, expect, test } from "vitest";

import type { ExpressionContext, ExpressionSignalDriver, ResponseSpec } from "@neobuni/contracts";

import { compileExpressionSet } from "./compile-expression-set";

const responseSpec: ResponseSpec = {
  goal: "stay_present",
  stance: "comforting",
  tone: ["warm", "steady"],
  mustAvoid: ["pressure_for_connection"],
  intimacyCap: "subtle",
  verbosity: "medium",
  shouldAskFollowup: true,
  shouldSuggestAction: true,
  toolPolicy: "allow",
};

const context: ExpressionContext = {
  userIntent: "support",
  emotionalLoad: "high",
  vulnerability: "high",
  protectiveLevel: 2,
  primaryStance: "protective",
  workingMemoryFocus: "support",
};

const signalDrivers: ExpressionSignalDriver[] = [
  {
    kind: "distress_language",
    score: 0.91,
    strengthBand: "strong",
    consumptionMode: "decision_input",
  },
  {
    kind: "negative_trend",
    score: 0.62,
    strengthBand: "medium",
    consumptionMode: "context_hint",
  },
];

describe("compileExpressionSet", () => {
  test("compiles text, voice, and ui plans from one response policy", () => {
    const result = compileExpressionSet({
      responseSpec,
      context,
      signalDrivers,
    });

    expect(result.text.openingMode).toBe("grounding_first");
    expect(result.voice.cadenceMode).toBe("slow_grounded");
    expect(result.voice.repairMode).toBe("gentle_reassurance");
    expect(result.ui.messageFrame).toBe("support_panel");
    expect(result.ui.alertStyle).toBe("protective_notice");
    expect(result.text.renderHints).toContain("driver:distress_language");
    expect(result.voice.renderHints).toContain("driver:distress_language");
    expect(result.ui.renderHints).toContain("driver:distress_language");
  });
});
