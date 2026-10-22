import type { DecisionAnswer, RetrievalPlan } from "@neobuni/contracts"

const routableRetrievalQuestionIds = [
  "retrieval.temporal_activation.v1",
  "retrieval.graph_activation.v1",
  "retrieval.knowledge_activation.v1",
] as const

type RetrievalRoutingResult = {
  retrievalPlan: RetrievalPlan
  appliedQuestionIds: string[]
}

const isHighConfidence = (
  answer: DecisionAnswer | undefined,
  threshold: number,
) =>
  answer !== undefined &&
  answer.confidence !== null &&
  answer.confidence >= threshold

const findAnswer = (answers: DecisionAnswer[], questionId: string) =>
  answers.find((answer) => answer.questionId === questionId)

const applyJevRetrievalSuppression = (input: {
  retrievalPlan: RetrievalPlan
  answers: DecisionAnswer[]
  confidenceThreshold: number
}): RetrievalRoutingResult => {
  const temporalAnswer = findAnswer(
    input.answers,
    "retrieval.temporal_activation.v1",
  )
  const graphAnswer = findAnswer(input.answers, "retrieval.graph_activation.v1")
  const knowledgeAnswer = findAnswer(
    input.answers,
    "retrieval.knowledge_activation.v1",
  )
  const suppressTemporal =
    input.retrievalPlan.activation.temporal.mode === "prefetch" &&
    isHighConfidence(temporalAnswer, input.confidenceThreshold) &&
    (temporalAnswer?.selectedValue === "skip" ||
      temporalAnswer?.selectedValue === "defer")
  const suppressGraph =
    input.retrievalPlan.activation.graph.mode === "prefetch" &&
    isHighConfidence(graphAnswer, input.confidenceThreshold) &&
    graphAnswer?.selectedValue === false
  const suppressKnowledge =
    input.retrievalPlan.activation.knowledge.mode === "prefetch" &&
    isHighConfidence(knowledgeAnswer, input.confidenceThreshold) &&
    knowledgeAnswer?.selectedValue === false
  const temporalMode = suppressTemporal
    ? temporalAnswer?.selectedValue === "defer"
      ? "defer_to_tool"
      : "skip"
    : input.retrievalPlan.activation.temporal.mode
  const graphMode = suppressGraph
    ? "skip"
    : input.retrievalPlan.activation.graph.mode
  const knowledgeMode = suppressKnowledge
    ? "skip"
    : input.retrievalPlan.activation.knowledge.mode
  const appliedQuestionIds = [
    temporalMode !== input.retrievalPlan.activation.temporal.mode
      ? "retrieval.temporal_activation.v1"
      : null,
    graphMode !== input.retrievalPlan.activation.graph.mode
      ? "retrieval.graph_activation.v1"
      : null,
    knowledgeMode !== input.retrievalPlan.activation.knowledge.mode
      ? "retrieval.knowledge_activation.v1"
      : null,
  ].filter((value): value is string => value !== null)
  const activation = {
    temporal: {
      ...input.retrievalPlan.activation.temporal,
      mode: temporalMode,
    },
    graph: { ...input.retrievalPlan.activation.graph, mode: graphMode },
    knowledge: {
      ...input.retrievalPlan.activation.knowledge,
      mode: knowledgeMode,
    },
  } as RetrievalPlan["activation"]
  const queries = {
    temporal:
      temporalMode === "prefetch" ? input.retrievalPlan.queries.temporal : null,
    graph: graphMode === "prefetch" ? input.retrievalPlan.queries.graph : null,
    knowledge:
      knowledgeMode === "prefetch"
        ? input.retrievalPlan.queries.knowledge
        : null,
  }
  return {
    retrievalPlan: {
      ...input.retrievalPlan,
      activation,
      queries,
      stores: (["temporal", "graph", "knowledge"] as const).filter(
        (store) => queries[store] !== null,
      ),
    },
    appliedQuestionIds,
  }
}

export { applyJevRetrievalSuppression, routableRetrievalQuestionIds }
export type { RetrievalRoutingResult }
