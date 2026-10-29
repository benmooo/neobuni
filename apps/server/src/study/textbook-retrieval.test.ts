import { describe, expect, test } from "vitest";

import { parseChunkLocator } from "./textbook-retrieval";

describe("parseChunkLocator", () => {
  test("reads chapter, page and page range from a chunk header", () => {
    expect(
      parseChunkLocator(
        "【第13章 层次式架构设计理论与实践 · p.459-461】\n分层式体系结构…"
      )
    ).toEqual({
      chapter: "第13章 层次式架构设计理论与实践",
      locator: "【第13章 层次式架构设计理论与实践 · p.459-461】",
      page: 459,
      pageEnd: 461,
    });
  });

  test("keeps single-page chunks without a range", () => {
    expect(
      parseChunkLocator("【第9章 软件可靠性基础知识 · p.334】\n软件可靠性…")
    ).toMatchObject({ page: 334, pageEnd: null });
  });

  test("ignores chunks without a locator or body", () => {
    expect(parseChunkLocator("普通文本，没有位置标记")).toBeNull();
    expect(parseChunkLocator("【第1章 绪论 · p.13】")).toBeNull();
    expect(parseChunkLocator("【第1章 绪论 · p.abc】\n正文")).toBeNull();
  });

  test("normalises an inverted page range", () => {
    expect(
      parseChunkLocator("【第2章 计算机系统基础知识 · p.40-38】\n正文")
    ).toMatchObject({
      page: 40,
      pageEnd: null,
    });
  });
});
