import type { RetrievalPlan } from "@neobuni/contracts";
import { Effect } from "effect";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordDecisionTrace: vi.fn(),
  listDecisionTracesByProfile: vi.fn(),
  decide: vi.fn(),
  state: { graphV2ShadowEnabled: false },
}));

vi.mock("@neobuni/db", () => ({
  listDecisionTracesByProfile: mocks.listDecisionTracesByProfile,
  recordDecisionTrace: mocks.recordDecisionTrace,
}));
vi.mock("./jev-provider-config", () => ({
  getConfiguredJevProvider: async () => ({ decide: mocks.decide }),
  getJevRuntimeConfig: async () => ({
    metadata: {
      timeoutMs: 3000,
      maxRetries: 1,
      retrievalShadowEnabled: true,
      graphV2ShadowEnabled: mocks.state.graphV2ShadowEnabled,
      evidenceRelevanceShadowEnabled: false,
      retrievalRoutingEnabled: true,
      retrievalConfidenceThreshold: 0.85,
      retrievalMinComparedPairs: 0,
      retrievalMinAgreementRate: 0,
      retrievalMaxAverageLatencyMs: 3000,
      retrievalMaxProviderErrorRate: 0.05,
      nextActionShadowEnabled: true,
    },
  }),
}));

mocks.recordDecisionTrace.mockReturnValue(Effect.succeed(undefined));
mocks.listDecisionTracesByProfile.mockReturnValue(Effect.succeed([]));
mocks.decide.mockResolvedValue({
  providerId: "jev",
  providerVersion: "jev-1.14.0",
  latencyMs: 12,
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
      confidence: 0.9,
    },
  ],
});

const { evaluateRetrievalDecision } = await import(
  "./retrieval-shadow-service"
);

const retrievalPlan = {
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
      targetPools: ["global"],
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
  stores: ["temporal", "graph"],
} satisfies RetrievalPlan;

afterEach(() => {
  mocks.recordDecisionTrace.mockClear();
  mocks.decide.mockClear();
  mocks.state.graphV2ShadowEnabled = false;
});

describe("evaluateRetrievalDecision", () => {
  test("records a provider failure as a safe deterministic fallback", async () => {
    mocks.decide.mockRejectedValueOnce(new Error("OpenRouter unavailable"));
    const result = await Effect.runPromise(
      evaluateRetrievalDecision({
        profileId: "profile-1",
        latestUserText: "remember",
        retrievalPlan,
        trigger: "chat_retrieval",
      })
    );
    expect(result.retrievalPlan).toEqual(retrievalPlan);
    expect(result.appliedQuestionIds).toEqual([]);
    expect(mocks.recordDecisionTrace.mock.calls[0]?.[0]).toMatchObject({
      decision: { policyResult: { reasons: ["jev_provider_error"] } },
    });
    expect(
      mocks.recordDecisionTrace.mock.calls[0]?.[0]?.judgments
    ).toHaveLength(3);
  });

  test("only suppresses existing high-confidence prefetches when routing is explicitly enabled", async () => {
    const result = await Effect.runPromise(
      evaluateRetrievalDecision({
        profileId: "profile-1",
        latestUserText: "remember",
        retrievalPlan,
        trigger: "chat_retrieval",
      })
    );
    expect(result.retrievalPlan.stores).toEqual([]);
    expect(result.appliedQuestionIds).toEqual([
      "retrieval.temporal_activation.v1",
      "retrieval.graph_activation.v1",
    ]);
    expect(mocks.recordDecisionTrace.mock.calls[0]?.[0]).toMatchObject({
      decision: {
        policyResult: {
          reasons: ["jev_high_confidence_retrieval_suppression"],
        },
      },
    });
    expect(
      (
        mocks.recordDecisionTrace.mock.calls[0]?.[0]?.judgments as Array<{
          provider: string;
          latencyMs: number;
        }>
      ).some(
        (judgment) => judgment.provider === "jev" && judgment.latencyMs === 12
      )
    ).toBe(true);
  });

  test("records graph v2 as shadow evidence without allowing it to route graph retrieval", async () => {
    mocks.state.graphV2ShadowEnabled = true;
    const result = await Effect.runPromise(
      evaluateRetrievalDecision({
        profileId: "profile-1",
        latestUserText: "remember",
        retrievalPlan,
        trigger: "chat_retrieval",
      })
    );

    const decisionRequests = mocks.decide.mock.calls as unknown as [
      { questions: Array<{ id: string }> },
    ][];
    expect(
      decisionRequests[0]?.[0].questions.map((question) => question.id)
    ).toContain("retrieval.graph_activation.v2");
    expect(result.appliedQuestionIds).not.toContain(
      "retrieval.graph_activation.v2"
    );
    expect(
      (
        mocks.recordDecisionTrace.mock.calls[0]?.[0]?.judgments as Array<{
          questionId: string;
          provider: string;
        }>
      ).some(
        (judgment) =>
          judgment.questionId === "retrieval.graph_activation.v2" &&
          judgment.provider === "heuristic"
      )
    ).toBe(true);
  });
});
