import { describe, expect, test } from "vitest"

import {
  getNewsBriefById,
  getNewsSourceById,
  listAllNewsSources,
  resolveNewsSourceQuery,
  searchNewsSources,
} from "./newsnow-catalog"

describe("newsnow catalog", () => {
  test("lists the full enabled source catalog in the requested order", () => {
    expect(listAllNewsSources().map((item) => item.sourceId)).toEqual([
      "v2ex-share",
      "coolapk",
      "36kr-quick",
      "36kr-renqi",
      "ithome",
      "pcbeta-windows11",
      "solidot",
      "hackernews",
      "producthunt",
      "github-trending-today",
      "sspai",
      "juejin",
      "baidu",
      "nowcoder",
      "ifeng",
      "chongbuluo-latest",
      "chongbuluo-hot",
      "zhihu",
      "weibo",
      "douyin",
      "hupu",
      "tieba",
      "toutiao",
      "thepaper",
      "bilibili-hot-search",
      "freebuf",
      "qqvideo-tv-hotsearch",
      "douban",
      "tencent-hot",
      "iqiyi-hot-ranklist",
      "zaobao",
      "sputniknewscn",
      "cankaoxiaoxi",
      "kaopu",
      "steam",
      "cls-depth",
      "cls-hot",
      "cls-telegraph",
      "mktnews-flash",
      "wallstreetcn-quick",
      "wallstreetcn-news",
      "wallstreetcn-hot",
      "xueqiu-hotstock",
      "gelonghui",
      "fastbull-express",
      "fastbull-news",
      "jin10",
    ])
  })

  test("maps every source to one of the four requested catalog groups", () => {
    const counts = listAllNewsSources().reduce<Record<string, number>>(
      (result, source) => ({
        ...result,
        [source.category]: (result[source.category] ?? 0) + 1,
      }),
      {},
    )

    expect(counts).toEqual({
      technology: 12,
      domestic: 18,
      international: 5,
      finance: 12,
    })
  })

  test("preserves publisher variants as structured subtitles", () => {
    expect(getNewsSourceById("36kr-quick")).toMatchObject({
      label: "36氪",
      subtitle: "快讯",
      category: "technology",
      locale: "zh-CN",
      enabled: true,
    })
    expect(getNewsSourceById("cls-telegraph")).toMatchObject({
      label: "财联社",
      subtitle: "电报",
      category: "finance",
      locale: "zh-CN",
      enabled: true,
    })
  })

  test("supports searching source labels, aliases, and catalog groups", () => {
    expect(
      searchNewsSources({ query: "bilibili" }).map((item) => item.sourceId),
    ).toEqual(["bilibili-hot-search"])
    expect(
      searchNewsSources({ query: "少数派" }).map((item) => item.sourceId),
    ).toEqual(["sspai"])
    expect(
      searchNewsSources({ query: "IT之家" }).map((item) => item.sourceId),
    ).toEqual(["ithome"])
    expect(
      searchNewsSources({ category: "international" }).map(
        (item) => item.sourceId,
      ),
    ).toEqual(["zaobao", "sputniknewscn", "cankaoxiaoxi", "kaopu", "steam"])
  })

  test("resolves a qualified source variant and makes publisher-only names ambiguous", () => {
    const resolved = resolveNewsSourceQuery({
      query: "36氪 快讯",
    })
    const ambiguous = resolveNewsSourceQuery({
      query: "财联社",
    })
    const exact = resolveNewsSourceQuery({
      query: "少数派",
    })

    expect(resolved.status).toBe("resolved")
    expect(resolved.resolvedSourceId).toBe("36kr-quick")
    expect(resolved.resolution?.matchKind).toBe("alias")
    expect(ambiguous.status).toBe("ambiguous")
    expect(ambiguous.resolvedSourceId).toBeNull()
    expect(ambiguous.items.map((item) => item.source.sourceId)).toEqual([
      "cls-depth",
      "cls-hot",
      "cls-telegraph",
    ])
    expect(exact.status).toBe("resolved")
    expect(exact.resolvedSourceId).toBe("sspai")
  })

  test("does not resolve an ambiguous publisher when the returned candidates are limited", () => {
    const result = resolveNewsSourceQuery({
      query: "财联社",
      limit: 1,
    })

    expect(result.status).toBe("ambiguous")
    expect(result.resolvedSourceId).toBeNull()
    expect(result.count).toBe(3)
    expect(result.items.map((item) => item.source.sourceId)).toEqual([
      "cls-depth",
    ])
  })

  test("updates curated briefs to canonical source ids", () => {
    expect(getNewsBriefById("tech")?.sourceIds).toEqual([
      "hackernews",
      "github-trending-today",
      "producthunt",
      "36kr-quick",
      "ithome",
      "juejin",
      "sspai",
    ])
    expect(getNewsBriefById("china")?.sourceIds).toEqual([
      "v2ex-share",
      "zhihu",
      "weibo",
      "bilibili-hot-search",
      "sspai",
      "thepaper",
    ])
  })
})
