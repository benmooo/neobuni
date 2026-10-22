import { afterEach, describe, expect, test } from "vitest";

import { createEmbedding } from "./openai-compatible-client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("createEmbedding", () => {
  test("passes dimensions to the OpenAI-compatible embeddings endpoint when configured", async () => {
    let requestBody: unknown = null;

    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body ?? "{}"));

      return new Response(
        JSON.stringify({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }) as typeof fetch;

    await createEmbedding(
      {
        apiKey: "test-key",
        model: "openai/text-embedding-3-small",
        baseUrl: "https://openrouter.ai/api/v1",
        dimensions: 1024,
      },
      "hello world",
    );

    expect(requestBody).toEqual({
      model: "openai/text-embedding-3-small",
      input: "hello world",
      encoding_format: "float",
      dimensions: 1024,
    });
  });

  test("omits dimensions when not configured", async () => {
    let requestBody: unknown = null;

    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body ?? "{}"));

      return new Response(
        JSON.stringify({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }) as typeof fetch;

    await createEmbedding(
      {
        apiKey: "test-key",
        model: "text-embedding-v4",
        baseUrl: "https://example.com/v1",
      },
      "hello world",
    );

    expect(requestBody).toEqual({
      model: "text-embedding-v4",
      input: "hello world",
      encoding_format: "float",
    });
  });
});
