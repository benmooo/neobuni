import { describe, expect, test } from "vitest";

import { getNewsBrief, interleaveHeadlines } from "./news-briefs";

describe("news briefs", () => {
  test("interleaveHeadlines round-robins sources until the max item limit", () => {
    const result = interleaveHeadlines(
      [
        [
          {
            rank: 1,
            sourceId: "hackernews",
            sourceName: "Source A",
            title: "A1",
            url: "https://example.com/a1",
            mobileUrl: null,
            publishedAt: null,
          },
          {
            rank: 2,
            sourceId: "hackernews",
            sourceName: "Source A",
            title: "A2",
            url: "https://example.com/a2",
            mobileUrl: null,
            publishedAt: null,
          },
        ],
        [
          {
            rank: 1,
            sourceId: "producthunt",
            sourceName: "Source B",
            title: "B1",
            url: "https://example.com/b1",
            mobileUrl: null,
            publishedAt: null,
          },
        ],
      ],
      3
    );

    expect(result.map((item) => item.title)).toEqual(["A1", "B1", "A2"]);
  });

  test("getNewsBrief merges source results and surfaces partial failures", async () => {
    const result = await getNewsBrief({
      briefId: "ai",
      countPerSource: 2,
      maxItems: 4,
      deps: {
        fetchNewsNowSource: async ({ sourceId }) => {
          if (sourceId === "github-trending-today") {
            throw new Error("GitHub trending unavailable");
          }

          return {
            provider: "newsnow",
            sourceId,
            sourceName: sourceId === "hackernews" ? "Hacker News" : "Fallback",
            updatedTime: "2026-05-30T00:00:00.000Z",
            items: [
              {
                rank: 1,
                sourceId,
                sourceName:
                  sourceId === "hackernews" ? "Hacker News" : "Fallback",
                title: `${sourceId}-1`,
                url: `https://example.com/${sourceId}-1`,
                mobileUrl: null,
                publishedAt: "2026-05-30T00:00:00.000Z",
              },
              {
                rank: 2,
                sourceId,
                sourceName:
                  sourceId === "hackernews" ? "Hacker News" : "Fallback",
                title: `${sourceId}-2`,
                url: `https://example.com/${sourceId}-2`,
                mobileUrl: null,
                publishedAt: "2026-05-29T23:00:00.000Z",
              },
            ],
          };
        },
      },
    });

    expect(result.briefId).toBe("ai");
    expect(result.sourceCount).toBe(4);
    expect(result.count).toBe(4);
    expect(result.items.map((item) => item.title)).toEqual([
      "hackernews-1",
      "producthunt-1",
      "juejin-1",
      "hackernews-2",
    ]);
    expect(
      result.sources.some(
        (source) =>
          source.sourceId === "github-trending-today" &&
          source.status === "error" &&
          source.error?.includes("unavailable")
      )
    ).toBe(true);
    expect(result.notes[0]).toContain("GitHub Today");
  });
});
