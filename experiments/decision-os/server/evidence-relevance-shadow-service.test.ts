import { Effect } from "effect";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordDecisionTrace: vi.fn(),
  decide: vi.fn(),
  state: { enabled: false },
}));

vi.mock("@neobuni/db", () => ({
  recordDecisionTrace: mocks.recordDecisionTrace,
}));
vi.mock("./jev-provider-config", () => ({
  getJevRuntimeConfig: async () => ({
    metadata: { evidenceRelevanceShadowEnabled: mocks.state.enabled },
  }),
  getConfiguredJevProvider: async () => ({ decide: mocks.decide }),
}));

mocks.recordDecisionTrace.mockReturnValue(Effect.succeed(undefined));
mocks.decide.mockResolvedValue({
  providerVersion: "jev-1.14",
  latencyMs: 12,
  answers: [
    {
      questionId: "retrieval.evidence_relevance.v1.1",
      kind: "score",
      selectedValue: 0.8,
      probabilities: {},
      confidence: 0.8,
    },
  ],
});

const { recordEvidenceRelevanceShadow } = await import(
  "./evidence-relevance-shadow-service"
);

const evidence = [
  {
    id: "evidence-1",
    store: "temporal" as const,
    kind: "memory" as const,
    title: null,
    content: "Relevant memory",
    score: 0.6,
    confidence: null,
    recency: null,
    retrievalReason: "explicit_reference" as const,
    provenance: { sourceType: "memory" as const, sourceId: "memory-1" },
    metadata: {},
  },
];

afterEach(() => {
  mocks.state.enabled = false;
  mocks.decide.mockClear();
  mocks.recordDecisionTrace.mockClear();
});

describe("recordEvidenceRelevanceShadow", () => {
  test("does not call Jev or persist a trace while disabled", async () => {
    const result = await Effect.runPromise(
      recordEvidenceRelevanceShadow({
        profileId: "profile-1",
        latestUserText: "What did we decide?",
        evidence,
        trigger: "test",
      })
    );
    expect(result).toEqual({ status: "disabled", evidenceIds: [] });
    expect(mocks.decide).not.toHaveBeenCalled();
    expect(mocks.recordDecisionTrace).not.toHaveBeenCalled();
  });

  test("records a trace without mutating the supplied evidence", async () => {
    mocks.state.enabled = true;
    const result = await Effect.runPromise(
      recordEvidenceRelevanceShadow({
        profileId: "profile-1",
        latestUserText: "What did we decide?",
        evidence,
        trigger: "test",
      })
    );
    expect(result).toEqual({ status: "answered", evidenceIds: ["evidence-1"] });
    expect(mocks.decide).toHaveBeenCalledTimes(1);
    const traceCalls = mocks.recordDecisionTrace.mock.calls as unknown as [
      { decision: unknown; candidates: unknown },
    ][];
    expect(traceCalls[0]?.[0]).toMatchObject({
      decision: { route: "stay_silent" },
      candidates: [],
    });
    expect(evidence[0]?.score).toBe(0.6);
  });
});
