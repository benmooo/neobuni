import { afterEach, describe, expect, test } from "vitest";

import {
  buildOpenCodeHeaders,
  listOpenCodeModels,
  resolveOpenCodeModelsUrl,
} from "./opencode";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("buildOpenCodeHeaders", () => {
  test("identifies the client and forwards the session id", () => {
    expect(buildOpenCodeHeaders({ sessionId: "thread-123" })).toEqual({
      "User-Agent": "neobuni/1.0",
      "x-opencode-session": "thread-123",
    });
  });
});

describe("resolveOpenCodeModelsUrl", () => {
  test("strips the protocol surface and appends the catalogue path", () => {
    expect(
      resolveOpenCodeModelsUrl("https://opencode.ai/inference/openai/v1")
    ).toBe("https://opencode.ai/inference/v1/models");
  });

  test("resolves the Go catalogue from the Go base URL", () => {
    expect(
      resolveOpenCodeModelsUrl("https://opencode.ai/inference/go/openai/v1")
    ).toBe("https://opencode.ai/inference/go/v1/models");
  });

  test("falls back to the default base URL when none is configured", () => {
    expect(resolveOpenCodeModelsUrl("")).toBe(
      "https://opencode.ai/inference/go/v1/models"
    );
    expect(resolveOpenCodeModelsUrl()).toBe(
      "https://opencode.ai/inference/go/v1/models"
    );
  });

  test("keeps proxy base URLs that do not look like the inference surface", () => {
    expect(resolveOpenCodeModelsUrl("https://proxy.example.com/v1")).toBe(
      "https://proxy.example.com/v1/v1/models"
    );
  });
});

describe("listOpenCodeModels", () => {
  test("returns a deduplicated, sorted model list", async () => {
    let requestedUrl = "";

    globalThis.fetch = (async (input) => {
      requestedUrl = String(input);

      return new Response(
        JSON.stringify({
          object: "list",
          data: [{ id: "kimi-k3" }, { id: "glm-5.3-flash" }, { id: "kimi-k3" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const models = await listOpenCodeModels({ baseUrl: "" });

    expect(requestedUrl).toBe("https://opencode.ai/inference/go/v1/models");
    expect(models).toEqual(["glm-5.3-flash", "kimi-k3"]);
  });

  test("surfaces a readable error when the catalogue request fails", async () => {
    globalThis.fetch = (async (_input: unknown) =>
      new Response("nope", { status: 503 })) as unknown as typeof fetch;

    await expect(listOpenCodeModels()).rejects.toThrow(
      "OpenCode model list request failed (503)"
    );
  });
});
