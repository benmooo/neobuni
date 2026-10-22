import { describe, expect, test } from "vitest"
import { buildNextActionShadowDecision } from "./next-action-shadow"

describe("buildNextActionShadowDecision", () => {
  test("keeps the heuristic selection and bounded candidate IDs in one auditable question", () => {
    const result = buildNextActionShadowDecision({
      decisionId: "decision-1",
      candidates: [
        {
          id: "open",
          kind: "commitment_followup",
          title: "推进：写规格",
          rationale: "关联目标",
          reversibility: "reversible",
          authority: "suggest",
          eligible: true,
        },
        {
          id: "blocked",
          kind: "commitment_followup",
          title: "处理阻塞：等待接口",
          rationale: "关联目标",
          reversibility: "reversible",
          authority: "suggest",
          eligible: true,
        },
      ],
    })
    expect(result.heuristicAnswers[0]).toMatchObject({
      selectedValue: "blocked",
      confidence: 1,
    })
    expect(result.request?.questions[0]?.criteria).toEqual({
      blocked: "关联目标",
      open: "关联目标",
    })
    expect(result.request?.questions[1]).toMatchObject({
      id: "initiative.interruption_value.v1",
      kind: "score",
    })
    expect(result.heuristicAnswers[1]).toMatchObject({
      questionId: "initiative.interruption_value.v1",
      selectedValue: 0.75,
    })
  })

  test("does not compile an unbounded question when no candidate is eligible", () => {
    const result = buildNextActionShadowDecision({
      decisionId: "decision-1",
      candidates: [],
    })
    expect(result.request).toBeNull()
    expect(result.heuristicAnswers).toEqual([
      {
        questionId: "initiative.interruption_value.v1",
        kind: "score",
        selectedValue: 0,
        probabilities: {},
        confidence: 1,
      },
    ])
  })

  test("keeps Chinese choice IDs and heuristic selection stable across option order", () => {
    const candidates = [
      {
        id: "commitment:beta",
        kind: "commitment_followup",
        title: "推进：完成中文评估集",
        rationale: "推进目标",
        reversibility: "reversible" as const,
        authority: "suggest" as const,
        eligible: true,
      },
      {
        id: "commitment:alpha",
        kind: "commitment_followup",
        title: "处理阻塞：等待设计确认",
        rationale: "先解除阻塞",
        reversibility: "reversible" as const,
        authority: "suggest" as const,
        eligible: true,
      },
    ]
    const forward = buildNextActionShadowDecision({
      decisionId: "decision-1",
      candidates,
    })
    const reversed = buildNextActionShadowDecision({
      decisionId: "decision-1",
      candidates: [...candidates].reverse(),
    })
    expect(forward.heuristicAnswers[0]?.selectedValue).toBe("commitment:alpha")
    expect(reversed.heuristicAnswers[0]?.selectedValue).toBe("commitment:alpha")
    expect(forward.request?.questions[0]?.criteria).toEqual(
      reversed.request?.questions[0]?.criteria,
    )
  })

  test("bounds the provider choice set to the top three deterministic candidates", () => {
    const result = buildNextActionShadowDecision({
      decisionId: "decision-1",
      candidates: ["d", "c", "b", "a"].map((id) => ({
        id,
        kind: "commitment_followup",
        title: `推进：${id}`,
        rationale: "关联目标",
        reversibility: "reversible" as const,
        authority: "suggest" as const,
        eligible: true,
      })),
    })
    expect(Object.keys(result.request?.questions[0]?.criteria ?? {})).toEqual([
      "a",
      "b",
      "c",
    ])
  })
})
