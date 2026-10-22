import { describe, expect, test } from "vitest"
import { composeDecisionRoute } from "./policy"

const base = {
  policyVersion: "v1",
  hardPolicyPermitted: true,
  authorityGranted: true,
  confidence: 0.9,
  confidenceThreshold: 0.8,
  interruptionValue: 0.8,
  interruptionThreshold: 0.55,
  reversibility: "reversible" as const,
}

describe("composeDecisionRoute", () => {
  test("hard policy denies before every other signal", () =>
    expect(
      composeDecisionRoute({ ...base, hardPolicyPermitted: false }).route,
    ).toBe("deny"))
  test("requires authority before Jev confidence is considered", () =>
    expect(
      composeDecisionRoute({ ...base, authorityGranted: false }).route,
    ).toBe("request_confirmation"))
  test("escalates an uncertain semantic judgment", () =>
    expect(composeDecisionRoute({ ...base, confidence: 0.7 }).route).toBe(
      "use_system_two",
    ))
  test("silences low-value interruptions", () =>
    expect(
      composeDecisionRoute({ ...base, interruptionValue: 0.4 }).route,
    ).toBe("stay_silent"))
  test("executes only authorized reversible work", () =>
    expect(composeDecisionRoute(base).route).toBe("execute"))
})
