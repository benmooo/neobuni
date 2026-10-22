import { describe, expect, test } from "vitest"

import { getNewsHeadlinesInputSchema } from "./get-news-headlines"

describe("news execution-layer contracts", () => {
  test("getNewsHeadlinesInputSchema accepts curated source ids and rejects unknown ids", () => {
    const parsed = getNewsHeadlinesInputSchema.parse({
      sourceId: "cls-telegraph",
    })

    expect(parsed.sourceId).toBe("cls-telegraph")
    expect(
      getNewsHeadlinesInputSchema.safeParse({
        sourceId: "unknown-source",
      }).success,
    ).toBe(false)
  })

  test("tools export resolve_news_source contract", async () => {
    const mod = await import("./tools")

    expect("resolveNewsSourceDef" in mod).toBe(true)
    expect("resolveNewsSourceInputSchema" in mod).toBe(true)

    if (
      !("resolveNewsSourceDef" in mod) ||
      !("resolveNewsSourceInputSchema" in mod)
    ) {
      return
    }

    const parsed = mod.resolveNewsSourceInputSchema.parse({
      query: "少数派",
    })

    expect(parsed.query).toBe("少数派")
  })

  test("tools do not export deprecated open_settings contract", async () => {
    const mod = await import("./tools")

    expect("openSettingsDef" in mod).toBe(false)
    expect("openSettingsInputSchema" in mod).toBe(false)
  })

  test("tools do not export the deprecated GitHub Trending contract", async () => {
    const mod = await import("./tools")

    expect("getGithubTrendingReposDef" in mod).toBe(false)
    expect("getGithubTrendingReposInputSchema" in mod).toBe(false)
  })
})
