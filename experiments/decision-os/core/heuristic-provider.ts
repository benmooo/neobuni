import type {
  DecisionAnswer,
  DecisionProviderResult,
  DecisionQuestion,
  DecisionRequest,
} from "@neobuni/contracts";

interface HeuristicDecisionProvider {
  decide: (input: DecisionRequest) => DecisionProviderResult;
  id: "heuristic";
}

const defaultAnswer = (question: DecisionQuestion): DecisionAnswer => ({
  questionId: question.id,
  kind: question.kind,
  selectedValue:
    question.kind === "noul"
      ? false
      : question.kind === "score"
        ? 0
        : "unknown",
  probabilities:
    question.kind === "noul" ? { false: 1, true: 0 } : { unknown: 1 },
  confidence: 0,
});

const createHeuristicDecisionProvider = (input?: {
  version?: string;
  answer?: (
    question: DecisionQuestion,
    request: DecisionRequest
  ) => ReturnType<typeof defaultAnswer>;
}): HeuristicDecisionProvider => ({
  id: "heuristic",
  decide: (request) => ({
    providerId: "heuristic",
    providerVersion: input?.version ?? "baseline-v1",
    answers: request.questions.map(
      (question) =>
        input?.answer?.(question, request) ?? defaultAnswer(question)
    ),
    latencyMs: 0,
  }),
});

export type { HeuristicDecisionProvider };
export { createHeuristicDecisionProvider };
