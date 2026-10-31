import { describe, expect, test } from "vitest";

import {
  DeepSeekSearchError,
  errorForStatus,
  fetchDeepSeekPage,
  mapSearchItems,
  normalizeBaseUrl,
  searchDeepSeek,
} from "./deepseek-search";

interface CapturedRequest {
  body: Record<string, unknown>;
  headers: Record<string, string>;
  url: string;
}

const captureFetch = (
  respond: () => Response,
  captured: CapturedRequest[]
): typeof fetch =>
  (async (input: string | URL | Request, init?: RequestInit) => {
    captured.push({
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      headers: init?.headers as Record<string, string>,
      url: String(input),
    });

    return respond();
  }) as typeof fetch;

const jsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });

describe("normalizeBaseUrl", () => {
  test("trims trailing slashes and falls back to the default host", () => {
    expect(normalizeBaseUrl(undefined)).toBe("https://api.deepseek.com");
    expect(normalizeBaseUrl("")).toBe("https://api.deepseek.com");
    expect(normalizeBaseUrl("https://proxy.example.com/v1/")).toBe(
      "https://proxy.example.com/v1"
    );
  });
});

describe("errorForStatus", () => {
  test("maps each upstream status onto a retryable-aware error code", () => {
    expect(errorForStatus(400, "").code).toBe("invalid_input");
    expect(errorForStatus(401, "").code).toBe("unauthorized");
    expect(errorForStatus(402, "").code).toBe("insufficient_balance");
    expect(errorForStatus(403, "").code).toBe("blocked");
    expect(errorForStatus(404, "").code).toBe("not_found");
    expect(errorForStatus(429, "").code).toBe("rate_limited");
    expect(errorForStatus(429, "").retryable).toBe(true);
    expect(errorForStatus(503, "").code).toBe("upstream");
    expect(errorForStatus(503, "").retryable).toBe(true);
    expect(errorForStatus(402, "").retryable).toBe(false);
  });

  test("surfaces the upstream message when the body carries one", () => {
    const error = errorForStatus(502, JSON.stringify({ error: "boom" }));

    expect(error.message).toContain("boom");
  });
});

describe("mapSearchItems", () => {
  test("maps DeepSeek results into web search items with ranking signals", () => {
    const items = mapSearchItems([
      {
        title: "质量属性战术",
        url: "https://example.com/a",
        site_name: "Example",
        date: "2026-03-01",
        rerank_score: 2.4,
        authority: 3,
        summary: "关于质量属性战术的总结。",
      },
      { title: "missing url" },
      {
        url: "https://example.com/b",
        title: "B",
        rerank_score: null,
        authority: null,
      },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      authority: 3,
      publishedAt: "2026-03-01T00:00:00.000Z",
      rank: 1,
      rerankScore: 2.4,
      snippet: null,
      sourceName: "Example",
      summary: "关于质量属性战术的总结。",
      title: "质量属性战术",
      url: "https://example.com/a",
    });
    expect(items[1]?.rank).toBe(3); // rank keeps the upstream position
    expect(items[1]?.rerankScore).toBeNull();
    expect(items[1]?.authority).toBeNull();
    expect(items[1]?.publishedAt).toBeNull();
    expect(items[1]?.snippet).toBeNull();
  });

  test("returns an empty list for non-array payloads", () => {
    expect(mapSearchItems(undefined)).toEqual([]);
    expect(mapSearchItems({ results: [] })).toEqual([]);
  });
});

describe("searchDeepSeek", () => {
  test("posts the query with operators and optional flags untouched", async () => {
    const captured: CapturedRequest[] = [];
    const result = await searchDeepSeek({
      apiKey: "sk_test",
      count: 5,
      deps: {
        fetch: captureFetch(() => jsonResponse({ results: [] }), captured),
      },
      needContent: true,
      oriQuestion: "案例题怎么准备",
      query: 'site:ruankao.org.cn "质量属性" after:2025-01-01',
    });

    expect(result.provider).toBe("deepseek");
    expect(result.query).toBe(
      'site:ruankao.org.cn "质量属性" after:2025-01-01'
    );
    expect(captured).toHaveLength(1);
    expect(captured[0]?.url).toBe("https://api.deepseek.com/v1/tools/search");
    expect(captured[0]?.headers.Authorization).toBe("Bearer sk_test");
    expect(captured[0]?.body).toEqual({
      count: 5,
      need_content: true,
      ori_question: "案例题怎么准备",
      query: 'site:ruankao.org.cn "质量属性" after:2025-01-01',
    });
  });

  test("clamps the result count into the documented range", async () => {
    const captured: CapturedRequest[] = [];

    await searchDeepSeek({
      apiKey: "sk_test",
      count: 99,
      deps: { fetch: captureFetch(() => jsonResponse({}), captured) },
      query: "q",
    });

    expect(captured[0]?.body).toMatchObject({ count: 50 });
    expect("need_content" in (captured[0]?.body ?? {})).toBe(false);
  });

  test("requires an api key before any request is attempted", async () => {
    await expect(
      searchDeepSeek({ apiKey: "", query: "q" })
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  test("maps an upstream failure status onto a typed error", async () => {
    await expect(
      searchDeepSeek({
        apiKey: "sk_test",
        deps: {
          fetch: captureFetch(
            () => new Response("quota exceeded", { status: 402 }),
            []
          ),
        },
        query: "q",
      })
    ).rejects.toMatchObject({ code: "insufficient_balance", retryable: false });
  });

  test("times out into a retryable error", async () => {
    const hangingFetch = (async (_input: string, init?: RequestInit) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      })) as typeof fetch;

    const error = await searchDeepSeek({
      apiKey: "sk_test",
      deps: { fetch: hangingFetch },
      query: "q",
      timeoutMs: 5,
    }).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(DeepSeekSearchError);
    expect(error).toMatchObject({ code: "timeout", retryable: true });
  });
});

describe("fetchDeepSeekPage", () => {
  test("returns the extracted page document", async () => {
    const captured: CapturedRequest[] = [];
    const page = await fetchDeepSeekPage({
      apiKey: "sk_test",
      deps: {
        fetch: captureFetch(
          () => jsonResponse({ title: "帖子", content: "# 正文\n\n内容" }),
          captured
        ),
      },
      url: "https://example.com/post",
    });

    expect(captured[0]?.url).toBe("https://api.deepseek.com/v1/tools/fetch");
    expect(captured[0]?.body).toEqual({ url: "https://example.com/post" });
    expect(page.provider).toBe("deepseek");
    expect(page.document).toMatchObject({
      extractionMethod: "provider",
      markdown: "# 正文\n\n内容",
      plainText: "# 正文\n\n内容",
      title: "帖子",
      url: "https://example.com/post",
    });
  });

  test("throws not_found when the upstream body is empty", async () => {
    await expect(
      fetchDeepSeekPage({
        apiKey: "sk_test",
        deps: {
          fetch: captureFetch(() => jsonResponse({ content: "  " }), []),
        },
        url: "https://example.com/gone",
      })
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
