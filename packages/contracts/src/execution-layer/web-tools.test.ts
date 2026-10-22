import { describe, expect, test } from "vitest";

describe("web execution-layer contracts", () => {
  test("open-url contract accepts https URLs and defaults render mode", async () => {
    const mod = await import("./open-url");

    if (!("openUrlInputSchema" in mod)) {
      throw new Error("Expected openUrlInputSchema export.");
    }

    const parsed = mod.openUrlInputSchema.parse({
      url: "https://example.com/post",
    });

    expect(parsed.url).toBe("https://example.com/post");
    expect(parsed.renderMode).toBe("auto");
  });

  test("extract-page contract requires an instruction", async () => {
    const mod = await import("./extract-page");

    if (!("extractPageInputSchema" in mod)) {
      throw new Error("Expected extractPageInputSchema export.");
    }

    expect(
      mod.extractPageInputSchema.safeParse({
        url: "https://example.com/pricing",
      }).success
    ).toBe(false);
  });

  test("save-page-to-knowledge contract accepts optional title and trust level", async () => {
    const mod = await import("./save-page-to-knowledge");

    if (!("savePageToKnowledgeInputSchema" in mod)) {
      throw new Error("Expected savePageToKnowledgeInputSchema export.");
    }

    const parsed = mod.savePageToKnowledgeInputSchema.parse({
      url: "https://example.com/docs",
      title: "Example Docs",
      trustLevel: "curated",
    });

    expect(parsed.title).toBe("Example Docs");
    expect(parsed.trustLevel).toBe("curated");
  });

  test("search-web contract accepts query and optional domain filter", async () => {
    const mod = await import("./search-web");

    if (!("searchWebInputSchema" in mod)) {
      throw new Error("Expected searchWebInputSchema export.");
    }

    const parsed = mod.searchWebInputSchema.parse({
      query: "buni ai agents",
      domain: "github.com",
      limit: 5,
    });

    expect(parsed.query).toBe("buni ai agents");
    expect(parsed.domain).toBe("github.com");
    expect(parsed.limit).toBe(5);
  });

  test("summarize-page contract defaults to medium length", async () => {
    const mod = await import("./summarize-page");

    if (!("summarizePageInputSchema" in mod)) {
      throw new Error("Expected summarizePageInputSchema export.");
    }

    const parsed = mod.summarizePageInputSchema.parse({
      url: "https://example.com/post",
    });

    expect(parsed.length).toBe("medium");
  });

  test("tools export all five web contracts", async () => {
    const mod = await import("./tools");

    expect("openUrlDef" in mod).toBe(true);
    expect("extractPageDef" in mod).toBe(true);
    expect("savePageToKnowledgeDef" in mod).toBe(true);
    expect("searchWebDef" in mod).toBe(true);
    expect("summarizePageDef" in mod).toBe(true);
  });
});
