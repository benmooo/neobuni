import { Effect } from "effect";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createChatCompletion: vi.fn(),
  getMemoryReasoningProviderConfig: vi.fn(),
  getProviderConfig: vi.fn(),
}));

vi.mock("@neobuni/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@neobuni/db")>();
  return {
    ...actual,
    getMemoryReasoningProviderConfig: mocks.getMemoryReasoningProviderConfig,
    getProviderConfig: mocks.getProviderConfig,
  };
});

vi.mock("../providers/openai-compatible-client", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../providers/openai-compatible-client")
    >();
  return { ...actual, createChatCompletion: mocks.createChatCompletion };
});

const { gradeStudyChecks } = await import("./grading-service");

const providerConfig = {
  id: "config-1",
  profileId: "profile-1",
  slot: "memory_reasoning",
  provider: "openai",
  protocol: "openai",
  model: "test-model",
  apiKey: "test-key",
  baseUrl: "https://example.com/v1",
  enabled: true,
  metadata: {},
  createdAt: "2026-10-25T00:00:00.000Z",
  updatedAt: "2026-10-25T00:00:00.000Z",
};

const checks = [
  { answer: "short", id: "check-1", prompt: "Recall", rubric: null },
  {
    answer:
      "A long enough answer that explains the trade-off and gives a concrete example.",
    id: "check-2",
    prompt: "Apply",
    rubric: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMemoryReasoningProviderConfig.mockReturnValue(Effect.succeed(null));
  mocks.getProviderConfig.mockReturnValue(Effect.succeed(providerConfig));
});

describe("gradeStudyChecks", () => {
  test("uses a deterministic fallback when the provider fails", async () => {
    mocks.createChatCompletion.mockRejectedValue(new Error("provider down"));

    const result = await gradeStudyChecks({
      checks,
      lessonTitle: "Quality attributes",
      objective: "Explain quality attributes",
      profileId: "profile-1",
    });

    expect(result.gradedBy).toBe("deterministic");
    expect(result.grades).toHaveLength(2);
    expect(result.grades[0]?.score).toBeLessThan(result.grades[1]?.score ?? 1);
  });

  test("normalizes LLM grades and fills missing items", async () => {
    mocks.createChatCompletion.mockResolvedValue(
      JSON.stringify({
        grades: [
          {
            feedback: "Good",
            missingPoints: [],
            promptId: "check-1",
            score: 0.8,
          },
        ],
      })
    );

    const result = await gradeStudyChecks({
      checks,
      lessonTitle: "Quality attributes",
      objective: "Explain quality attributes",
      profileId: "profile-1",
    });

    expect(result.gradedBy).toBe("llm");
    expect(result.grades[0]).toMatchObject({
      passed: true,
      promptId: "check-1",
      score: 0.8,
    });
    expect(result.grades[1]).toMatchObject({
      promptId: "check-2",
    });
  });

  test("passes the configured model and lesson context to the provider", async () => {
    mocks.createChatCompletion.mockResolvedValue(
      JSON.stringify({ grades: [] })
    );

    await gradeStudyChecks({
      checks,
      lessonTitle: "Quality attributes",
      objective: "Explain quality attributes",
      profileId: "profile-1",
    });

    expect(mocks.createChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-model" }),
      expect.arrayContaining([
        expect.objectContaining({ role: "system" }),
        expect.objectContaining({ role: "user" }),
      ]),
      expect.objectContaining({ temperature: 0 })
    );
  });
});
