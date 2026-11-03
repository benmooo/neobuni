import { describe, expect, test, vi } from "vitest";

import { fetchPageWithProvider, searchWithProvider } from "./dispatch";

const jsonResponse = (payload: unknown) =>
  new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });

const deepseek = {
  apiKey: "sk-deepseek",
  baseUrl: "https://api.deepseek.com",
  kind: "deepseek" as const,
};

describe("searchWithProvider", () => {
  test("sends the resolved key to the DeepSeek search endpoint", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ results: [{ url: "https://example.com", title: "T" }] })
    );

    await searchWithProvider({
      count: 5,
      deps: { fetch: fetchMock as unknown as typeof fetch },
      provider: deepseek,
      query: "质量属性 site:zhihu.com",
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.deepseek.com/v1/tools/search");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-deepseek"
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      count: 5,
      query: "质量属性 site:zhihu.com",
    });
  });
});

describe("fetchPageWithProvider", () => {
  test("fetches a page through the DeepSeek fetch endpoint", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        content: "正文",
        title: "标题",
        url: "https://example.com",
      })
    );

    const page = await fetchPageWithProvider({
      deps: { fetch: fetchMock as unknown as typeof fetch },
      provider: deepseek,
      url: "https://example.com",
    });

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://api.deepseek.com/v1/tools/fetch");
    expect(page.provider).toBe("deepseek");
    expect(page.document.title).toBe("标题");
  });
});
