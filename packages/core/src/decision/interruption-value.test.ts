import { describe, expect, test } from "vitest"
import {
  buildInterruptionValueShadowQuestion,
  buildInterruptionValueState,
  calculateHeuristicInterruptionValue,
} from "./interruption-value"

const candidate = (title: string) => ({
  id: title,
  kind: "commitment_followup",
  title,
  rationale: "关联活跃目标。",
  reversibility: "reversible" as const,
  authority: "suggest" as const,
  eligible: true,
})

describe("interruption value", () => {
  test("does not assign interruption value when no bounded action exists", () => {
    expect(calculateHeuristicInterruptionValue({ candidates: [] })).toBe(0)
  })

  test("prioritizes a bounded blocked commitment without allowing an action", () => {
    const candidates = [
      candidate("推进：写规格"),
      candidate("处理阻塞：等待接口"),
    ]
    expect(calculateHeuristicInterruptionValue({ candidates })).toBe(0.75)
    expect(buildInterruptionValueState({ candidates })).toMatchObject({
      userContext: "unknown",
      candidates: [{ id: "推进：写规格" }, { id: "处理阻塞：等待接口" }],
    })
    expect(buildInterruptionValueShadowQuestion()).toMatchObject({
      id: "initiative.interruption_value.v1",
      kind: "score",
    })
  })
})
