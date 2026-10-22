import { describe, expect, test } from "vitest"
import { applyJevRetrievalSuppression } from "./retrieval-routing"

const plan = {
  intent: "personal_history" as const,
  intentProfile: {
    personalHistory: 1,
    relationshipState: 0,
    taskState: 0,
    topicContinuity: 0,
    worldKnowledge: 0,
  },
  activation: {
    temporal: { mode: "prefetch" as const, score: 0.9, reasons: [] },
    graph: { mode: "prefetch" as const, score: 0.8, reasons: [] },
    knowledge: { mode: "skip" as const, score: 0, reasons: [] },
  },
  queries: {
    temporal: {
      query: "remember",
      keywords: [],
      targetPools: ["global"] as ("unresolved" | "recent" | "global")[],
      expectedTypes: [],
      limit: 8,
    },
    graph: {
      seedTerms: ["remember"],
      relationTypes: [],
      maxDepth: 1,
      limit: 6,
    },
    knowledge: null,
  },
  reasons: ["explicit_reference" as const],
  stores: ["temporal", "graph"] as ("temporal" | "graph" | "knowledge")[],
}

describe("applyJevRetrievalSuppression", () => {
  test("only suppresses a heuristic prefetch on a high-confidence bounded answer", () => {
    const result = applyJevRetrievalSuppression({
      retrievalPlan: plan,
      confidenceThreshold: 0.8,
      answers: [
        {
          questionId: "retrieval.temporal_activation.v1",
          kind: "choice",
          selectedValue: "skip",
          probabilities: {},
          confidence: 0.9,
        },
        {
          questionId: "retrieval.graph_activation.v1",
          kind: "noul",
          selectedValue: false,
          probabilities: {},
          confidence: 0.8,
        },
      ],
    })
    expect(result.retrievalPlan.stores).toEqual([])
    expect(result.retrievalPlan.queries.temporal).toBeNull()
    expect(result.appliedQuestionIds).toEqual([
      "retrieval.temporal_activation.v1",
      "retrieval.graph_activation.v1",
    ])
  })

  test("does not enable a skipped store or route a low-confidence answer", () => {
    const result = applyJevRetrievalSuppression({
      retrievalPlan: plan,
      confidenceThreshold: 0.8,
      answers: [
        {
          questionId: "retrieval.knowledge_activation.v1",
          kind: "noul",
          selectedValue: true,
          probabilities: {},
          confidence: 1,
        },
        {
          questionId: "retrieval.graph_activation.v1",
          kind: "noul",
          selectedValue: false,
          probabilities: {},
          confidence: 0.7,
        },
      ],
    })
    expect(result.retrievalPlan.stores).toEqual(["temporal", "graph"])
    expect(result.appliedQuestionIds).toEqual([])
  })
})
