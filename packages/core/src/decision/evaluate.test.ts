import { describe, expect, test } from "vitest"
import { summarizeDecisionEvaluation } from "./evaluate"

describe("summarizeDecisionEvaluation", () => {
  test("compares like-for-like Jev and heuristic answers and aggregates feedback", () => {
    const summary = summarizeDecisionEvaluation([
      {
        judgments: [
          {
            provider: "heuristic",
            questionId: "q1",
            kind: "choice",
            selectedValue: "a",
            probabilities: {},
            confidence: 1,
            latencyMs: 0,
          },
          {
            provider: "jev",
            questionId: "q1",
            kind: "choice",
            selectedValue: "a",
            probabilities: {},
            confidence: 0.8,
            latencyMs: 30,
          },
          {
            provider: "jev",
            questionId: "unpaired",
            kind: "noul",
            selectedValue: true,
            probabilities: {},
            confidence: 0.7,
            latencyMs: 10,
          },
        ],
        feedback: [{ kind: "accepted" }, { kind: "deferred" }],
        decision: {
          policyResult: {
            permitted: true,
            route: "stay_silent",
            reasons: ["jev_provider_error"],
            policyVersion: "test",
          },
        },
      },
    ])
    expect(summary).toMatchObject({
      totalDecisions: 1,
      comparedJudgmentPairs: 1,
      matchingJudgmentPairs: 1,
      agreementRate: 1,
      averageJevLatencyMs: 20,
      feedbackByKind: { accepted: 1, deferred: 1 },
      decisionReasonsByKind: { jev_provider_error: 1 },
    })
  })

  test("keeps a shadow-only question family out of a versioned release summary", () => {
    const summary = summarizeDecisionEvaluation(
      [
        {
          judgments: [
            {
              provider: "heuristic",
              questionId: "retrieval.graph_activation.v1",
              kind: "noul",
              selectedValue: false,
              probabilities: {},
              confidence: 1,
              latencyMs: 0,
            },
            {
              provider: "jev",
              questionId: "retrieval.graph_activation.v1",
              kind: "noul",
              selectedValue: true,
              probabilities: {},
              confidence: 0.9,
              latencyMs: 15,
            },
            {
              provider: "heuristic",
              questionId: "retrieval.graph_activation.v2",
              kind: "noul",
              selectedValue: false,
              probabilities: {},
              confidence: 1,
              latencyMs: 0,
            },
            {
              provider: "jev",
              questionId: "retrieval.graph_activation.v2",
              kind: "noul",
              selectedValue: false,
              probabilities: {},
              confidence: 0.9,
              latencyMs: 15,
            },
          ],
          feedback: [],
        },
      ],
      { questionIds: ["retrieval.graph_activation.v1"] },
    )

    expect(summary).toMatchObject({
      totalDecisions: 1,
      totalJudgments: 2,
      comparedJudgmentPairs: 1,
      matchingJudgmentPairs: 0,
      agreementRate: 0,
    })
  })
})
