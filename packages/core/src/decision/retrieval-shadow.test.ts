import { describe, expect, test } from "vitest"
import { buildRetrievalShadowDecision } from "./retrieval-shadow"

describe("buildRetrievalShadowDecision", () => {
  test("projects heuristic store activation as auditable typed answers", () => {
    const result = buildRetrievalShadowDecision({
      decisionId: "d1",
      latestUserText: "What did I decide last time?",
      retrievalPlan: {
        intent: "personal_history",
        intentProfile: {
          personalHistory: 1,
          relationshipState: 0,
          taskState: 0,
          topicContinuity: 0,
          worldKnowledge: 0,
        },
        activation: {
          temporal: { mode: "prefetch", score: 0.9, reasons: [] },
          graph: { mode: "skip", score: 0.1, reasons: [] },
          knowledge: { mode: "skip", score: 0, reasons: [] },
        },
        queries: { temporal: null, graph: null, knowledge: null },
        reasons: ["explicit_reference"],
        stores: ["temporal"],
      },
    })
    expect(result.heuristicAnswers[0]).toMatchObject({
      selectedValue: "retrieve_now",
      confidence: 0.9,
    })
    expect(result.request.questions).toHaveLength(3)
  })
})
