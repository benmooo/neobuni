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

const webclaw = {
  apiKey: "wc-key",
  baseUrl: "https://api.webclaw.io",
  kind: "webclaw" as const,
};

describe("searchWithProvider", () => {
  test("sends a deepseek key only to the deepseek endpoint", async () => {
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

  test("sends a webclaw key only to the webclaw endpoint", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ results: [{ url: "https://example.com", title: "T" }] })
    );

    await searchWithProvider({
      count: 3,
      deps: { fetch: fetchMock as unknown as typeof fetch },
      provider: webclaw,
      query: "软件架构",
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.webclaw.io/v1/search");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer wc-key"
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      num_results: 3,
      query: "软件架构",
    });
  });
});

describe("fetchPageWithProvider", () => {
  test("fetches a page through the provider that owns the key", async () => {
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
