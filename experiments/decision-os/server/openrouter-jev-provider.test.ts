import { describe, expect, test } from "vitest";

import {
  createOpenRouterJevProvider,
  OPENROUTER_DECISIONS_URL,
} from "./openrouter-jev-provider";

describe("createOpenRouterJevProvider", () => {
  test("uses the OpenRouter Decisions API and maps typed answers without granting execution", async () => {
    let requestUrl = "";
    let requestBody: unknown;
    const provider = createOpenRouterJevProvider({
      apiKey: "test-key",
      model: "typesafe/jev-1.14",
      fetchImpl: async (url, init) => {
        requestUrl = String(url);
        requestBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            model: "typesafe/jev-1.14",
            answers: {
              relevant: {
                noul: 0.9,
                probabilities: { true: 0.9, false: 0.1 },
                confidence: 0.8,
              },
            },
          }),
          { status: 200 }
        );
      },
    });
    const result = await provider.decide({
      decisionId: "decision-1",
      state: { message: "remember this" },
      questions: [
        {
          id: "relevant",
          kind: "noul",
          instructions: "Is the message relevant?",
        },
      ],
    });
    expect(requestUrl).toBe(OPENROUTER_DECISIONS_URL);
    expect(requestBody).toMatchObject({
      model: "typesafe/jev-1.14",
      questions: { relevant: { type: "noul" } },
    });
    expect(result.answers[0]).toMatchObject({
      questionId: "relevant",
      selectedValue: true,
      confidence: 0.8,
    });
  });

  test("retries only transient provider failures", async () => {
    let calls = 0;
    const provider = createOpenRouterJevProvider({
      apiKey: "test-key",
      model: "typesafe/jev-1.14",
      maxRetries: 1,
      fetchImpl: async () => {
        calls += 1;
        return calls === 1
          ? new Response("temporary", { status: 503 })
          : new Response(
              JSON.stringify({ answers: { relevant: { noul: 0.9 } } }),
              { status: 200 }
            );
      },
    });
    await provider.decide({
      decisionId: "decision-1",
      state: {},
      questions: [{ id: "relevant", kind: "noul", instructions: "Relevant?" }],
    });
    expect(calls).toBe(2);
  });

  test("clamps score answers to the versioned zero-to-one contract", async () => {
    let requestBody: unknown;
    const provider = createOpenRouterJevProvider({
      apiKey: "test-key",
      model: "typesafe/jev-1.14",
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({ answers: { relevance: { score: 3 } } }),
          {
            status: 200,
          }
        );
      },
    });
    const result = await provider.decide({
      decisionId: "decision-1",
      state: {},
      questions: [
        {
          id: "relevance",
          kind: "score",
          instructions: "Score relevance.",
          criteria: { 0: "Irrelevant", 1: "Directly relevant" },
        },
      ],
    });
    expect(result.answers[0]?.selectedValue).toBe(1);
    expect(requestBody).toMatchObject({
      questions: {
        relevance: { criteria: ["Irrelevant", "Directly relevant"] },
      },
    });
  });
});

test("includes a provider error message without exposing request credentials", async () => {
  const provider = createOpenRouterJevProvider({
    apiKey: "test-key",
    model: "typesafe/jev-1.14",
    maxRetries: 0,
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          error: { message: "questions.relevant.criteria is required" },
        }),
        { status: 400 }
      ),
  });
  await expect(
    provider.decide({
      decisionId: "decision-1",
      state: {},
      questions: [
        { id: "relevant", kind: "choice", instructions: "Relevant?" },
      ],
    })
  ).rejects.toThrow("questions.relevant.criteria is required");
});
