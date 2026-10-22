import { describe, expect, test } from "vitest";
import { buildEvidenceRelevanceShadowDecision } from "./evidence-relevance-shadow";

describe("buildEvidenceRelevanceShadowDecision", () => {
  test("bounds and minimizes deterministic evidence without changing its baseline score", () => {
    const result = buildEvidenceRelevanceShadowDecision({
      decisionId: "decision-1",
      latestUserText: "What did we decide?",
      evidence: Array.from({ length: 7 }, (_, index) => ({
        id: `evidence-${index}`,
        store: "temporal" as const,
        kind: "memory" as const,
        title: null,
        content:
          index === 0
            ? `OPENAI_API_KEY=sk-123456789012345678901234 密钥：private-value ${"x".repeat(300)}`
            : "x".repeat(300),
        score: index === 0 ? 1.4 : 0.4,
        confidence: null,
        recency: null,
        retrievalReason: "explicit_reference" as const,
        provenance: {
          sourceType: "memory" as const,
          sourceId: `source-${index}`,
        },
        metadata: { secret: "not projected" },
      })),
    });

    expect(result.request.questions).toHaveLength(6);
    expect(result.evidenceIds).toEqual([
      "evidence-0",
      "evidence-1",
      "evidence-2",
      "evidence-3",
      "evidence-4",
      "evidence-5",
    ]);
    expect(result.heuristicAnswers[0]).toMatchObject({
      kind: "score",
      selectedValue: 1,
    });
    const projectedEvidence = result.request.state.evidence as Array<{
      id: string;
      deterministicScore: number;
    }>;
    expect(projectedEvidence[0]).toMatchObject({
      id: "evidence-0",
      deterministicScore: 1,
    });
    expect(JSON.stringify(result.request.state)).not.toContain("secret");
    expect(JSON.stringify(result.request.state)).not.toContain(
      "sk-123456789012345678901234"
    );
    expect(JSON.stringify(result.request.state)).not.toContain("private-value");
    expect(JSON.stringify(result.request.state)).toContain("[REDACTED]");
  });
});
