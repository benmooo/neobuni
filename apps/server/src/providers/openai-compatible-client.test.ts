import { afterEach, describe, expect, test } from "vitest";

import {
  createChatCompletion,
  createEmbedding,
} from "./openai-compatible-client";

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
        }
      );
    }) as typeof fetch;

    await createEmbedding(
      {
        apiKey: "test-key",
        model: "openai/text-embedding-3-small",
        baseUrl: "https://openrouter.ai/api/v1",
        dimensions: 1024,
      },
      "hello world"
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
        }
      );
    }) as typeof fetch;

    await createEmbedding(
      {
        apiKey: "test-key",
        model: "text-embedding-v4",
        baseUrl: "https://example.com/v1",
      },
      "hello world"
    );

    expect(requestBody).toEqual({
      model: "text-embedding-v4",
      input: "hello world",
      encoding_format: "float",
    });
  });
});

describe("createChatCompletion", () => {
  test("forwards custom headers alongside the auth header", async () => {
    let requestHeaders: Record<string, string> = {};

    globalThis.fetch = (async (_input, init) => {
      const headers = new Headers(init?.headers);

      requestHeaders = {
        authorization: headers.get("Authorization") ?? "",
        session: headers.get("x-opencode-session") ?? "",
        userAgent: headers.get("User-Agent") ?? "",
      };

      return new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const text = await createChatCompletion(
      {
        apiKey: "test-key",
        model: "glm-5.3-flash",
        baseUrl: "https://opencode.ai/inference/openai/v1",
        headers: {
          "User-Agent": "neobuni/1.0",
          "x-opencode-session": "study:profile-1",
        },
      },
      [{ role: "user", content: "hi" }]
    );

    expect(text).toBe("ok");
    expect(requestHeaders).toEqual({
      authorization: "Bearer test-key",
      session: "study:profile-1",
      userAgent: "neobuni/1.0",
    });
  });
});

describe("createChatCompletion temperature fallback", () => {
  test("retries without temperature when the provider rejects it", async () => {
    const bodies: Record<string, unknown>[] = [];

    globalThis.fetch = (async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      bodies.push(body);

      if ("temperature" in body) {
        return new Response(
          JSON.stringify({
            error: {
              type: "invalid_request_error",
              message: "invalid temperature: only 1 is allowed",
            },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const text = await createChatCompletion(
      {
        apiKey: "test-key",
        model: "kimi-k2.7-code",
        baseUrl: "https://opencode.ai/inference/go/openai/v1",
      },
      [{ role: "user", content: "hi" }],
      { temperature: 0.2 }
    );

    expect(text).toBe("ok");
    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.temperature).toBe(0.2);
    expect(bodies[1]).not.toHaveProperty("temperature");
  });

  test("does not retry on unrelated 400 responses", async () => {
    let calls = 0;

    globalThis.fetch = (async (_input: unknown) => {
      calls += 1;

      return new Response(
        JSON.stringify({ error: { message: "model not found" } }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    await expect(
      createChatCompletion(
        {
          apiKey: "test-key",
          model: "nope",
          baseUrl: "https://opencode.ai/inference/go/openai/v1",
        },
        [{ role: "user", content: "hi" }]
      )
    ).rejects.toThrow("OpenAI-compatible request failed (400)");
    expect(calls).toBe(1);
  });
});
