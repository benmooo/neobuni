import { afterEach, describe, expect, test } from "vitest";

const originalEnv = {
  apiKey: process.env.NEOBUNI_WEBCLAW_API_KEY,
  baseUrl: process.env.NEOBUNI_WEBCLAW_BASE_URL,
  timeoutMs: process.env.NEOBUNI_WEB_TIMEOUT_MS,
};

afterEach(() => {
  process.env.NEOBUNI_WEBCLAW_API_KEY = originalEnv.apiKey;
  process.env.NEOBUNI_WEBCLAW_BASE_URL = originalEnv.baseUrl;
  process.env.NEOBUNI_WEB_TIMEOUT_MS = originalEnv.timeoutMs;
});

describe("readWebclawConfig", () => {
  test("reads defaults for base url and timeout", async () => {
    process.env.NEOBUNI_WEBCLAW_API_KEY = "wc_test";
    process.env.NEOBUNI_WEBCLAW_BASE_URL = "";
    process.env.NEOBUNI_WEB_TIMEOUT_MS = "";

    const mod = await import("./webclaw");

    if (!("readWebclawConfig" in mod)) {
      throw new Error("Expected readWebclawConfig export.");
    }

    const config = mod.readWebclawConfig();

    expect(config.baseUrl).toBe("https://api.webclaw.io");
    expect(config.timeoutMs).toBe(10_000);
    expect(config.apiKey).toBe("wc_test");
  });
});

describe("fetchWebclawPage", () => {
  test("normalizes scrape payload into a WebPageDocument", async () => {
    const mod = await import("./webclaw");

    if (!("fetchWebclawPage" in mod)) {
      throw new Error("Expected fetchWebclawPage export.");
    }

    const page = await mod.fetchWebclawPage({
      url: "https://example.com/post",
      deps: {
        fetch: async () =>
          new Response(JSON.stringify({
            url: "https://example.com/post",
            metadata: {
              title: "Example Post",
              description: "Example excerpt",
              author: "Aka",
              published_date: "2026-06-13T00:00:00.000Z",
              language: "en",
              site_name: "Example",
            },
            markdown: "# Example Post",
            text: "Example Post",
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      },
      config: {
        apiKey: "wc_test",
        baseUrl: "https://api.webclaw.io",
        timeoutMs: 10_000,
      },
    });

    expect(page.provider).toBe("webclaw");
    expect(page.document.title).toBe("Example Post");
    expect(page.document.siteName).toBe("Example");
    expect(page.document.markdown).toContain("Example Post");
  });
});

describe("fetchWebclawExtract", () => {
  test("returns extracted JSON plus generated schema", async () => {
    const mod = await import("./webclaw");

    if (!("fetchWebclawExtract" in mod)) {
      throw new Error("Expected fetchWebclawExtract export.");
    }

    const result = await mod.fetchWebclawExtract({
      url: "https://example.com/pricing",
      instruction: "Extract all pricing tiers",
      deps: {
        fetch: async () =>
          new Response(JSON.stringify({
            data: {
              tiers: [{ name: "Pro", price: 49 }],
            },
            generated_schema: {
              type: "object",
            },
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      },
      config: {
        apiKey: "wc_test",
        baseUrl: "https://api.webclaw.io",
        timeoutMs: 10_000,
      },
    });

    expect(result.provider).toBe("webclaw");
    expect(result.data).toEqual({
      tiers: [{ name: "Pro", price: 49 }],
    });
    expect(result.generatedSchema).toEqual({ type: "object" });
  });
});

describe("fetchWebclawSearch", () => {
  test("normalizes search payload into WebSearchResultItem values", async () => {
    const mod = await import("./webclaw");

    if (!("fetchWebclawSearch" in mod)) {
      throw new Error("Expected fetchWebclawSearch export.");
    }

    const result = await mod.fetchWebclawSearch({
      query: "buni ai agents",
      limit: 2,
      deps: {
        fetch: async () =>
          new Response(JSON.stringify({
            results: [
              {
                title: "Buni Web Tools",
                url: "https://example.com/post",
                snippet: "A first version of web tools for Buni.",
                source_name: "Example",
                published_at: "2026-06-13T00:00:00.000Z",
              },
            ],
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      },
      config: {
        apiKey: "wc_test",
        baseUrl: "https://api.webclaw.io",
        timeoutMs: 10_000,
      },
    });

    expect(result.provider).toBe("webclaw");
    expect(result.query).toBe("buni ai agents");
    expect(result.items).toEqual([
      {
        rank: 1,
        title: "Buni Web Tools",
        url: "https://example.com/post",
        snippet: "A first version of web tools for Buni.",
        sourceName: "Example",
        publishedAt: "2026-06-13T00:00:00.000Z",
      },
    ]);
  });

  test("retries with the legacy num parameter when num_results is rejected", async () => {
    const mod = await import("./webclaw");

    if (!("fetchWebclawSearch" in mod)) {
      throw new Error("Expected fetchWebclawSearch export.");
    }

    let callCount = 0;
    const fetchMock = async (_input: string | URL | Request, init?: RequestInit) => {
      callCount += 1;
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};

      if (callCount === 1) {
        expect(body).toEqual({
          query: "buni ai agents",
          num_results: 2,
          scrape: false,
        });

        return new Response("unknown field num_results", { status: 400 });
      }

      expect(body).toEqual({
        query: "buni ai agents",
        num: 2,
        scrape: false,
      });

      return new Response(JSON.stringify({
        results: [
          {
            title: "Fallback Search Result",
            url: "https://example.com/fallback",
            snippet: "Legacy search payload succeeded.",
            position: 1,
          },
        ],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await mod.fetchWebclawSearch({
      query: "buni ai agents",
      limit: 2,
      deps: { fetch: fetchMock },
      config: {
        apiKey: "wc_test",
        baseUrl: "https://api.webclaw.io",
        timeoutMs: 10_000,
      },
    });

    expect(callCount).toBe(2);
    expect(result.items[0]?.title).toBe("Fallback Search Result");
  });
});
