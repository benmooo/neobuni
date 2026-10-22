---
title: "Web / Browser Tools V1 Implementation Plan"
---

# Web / Browser Tools V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Buni 增加第一版 Web / Browser execution tools，先交付 `open_url`、`extract_page`、`save_page_to_knowledge` 的可用闭环，再补 `search_web` 和 `summarize_page`。

**Architecture:** 沿用 Buni 已有的 `contracts -> tools -> integrations -> knowledge` 分层。网页读取与结构化抽取通过 `apps/server/src/integrations/web/` 对 `webclaw` 进行适配，并统一归一化为内部 `WebPageDocument`；知识写入不新增存储模型，而是直接桥接到现有 `ingestKnowledgeDocument`。P0 只支持 `webclaw`，但从第一步就预留 provider 边界，避免后续接 `ScrapeGraphAI` 时回滚 contracts。

**Tech Stack:** Bun, TypeScript, Zod, Hono, `@tanstack/ai`, existing Buni SQLite/knowledge ingest, external `webclaw` REST API.

**Execution Status (2026-06-13):**
- 当前工作树已完成 Task 1-6 的实现和验证。
- `summarize_page` 最终按 design spec 落为 Buni 自己的 orchestration：先拿规范化页面，再走 reasoning provider；没有透传 provider 原生 summary API。
- 计划里的 `git commit` 步骤本轮未执行。

---

### Task 1: 定义 Web 工具 contracts 与共享 schema

**Files:**
- Create: `packages/contracts/src/execution-layer/web-shared.ts`
- Create: `packages/contracts/src/execution-layer/open-url.ts`
- Create: `packages/contracts/src/execution-layer/extract-page.ts`
- Create: `packages/contracts/src/execution-layer/save-page-to-knowledge.ts`
- Create: `packages/contracts/src/execution-layer/web-tools.test.ts`
- Modify: `packages/contracts/src/execution-layer/tools.ts`

- [ ] **Step 1: 写 contract 测试，固定输入/输出与导出面**

```ts
// packages/contracts/src/execution-layer/web-tools.test.ts
import { describe, expect, test } from "bun:test";

import { extractPageInputSchema } from "./extract-page";
import { openUrlInputSchema } from "./open-url";
import { savePageToKnowledgeInputSchema } from "./save-page-to-knowledge";

describe("web execution-layer contracts", () => {
  test("openUrlInputSchema accepts https URLs and defaults render mode", () => {
    const parsed = openUrlInputSchema.parse({
      url: "https://example.com/post",
    });

    expect(parsed.url).toBe("https://example.com/post");
    expect(parsed.renderMode).toBe("auto");
  });

  test("extractPageInputSchema requires an instruction", () => {
    expect(
      extractPageInputSchema.safeParse({
        url: "https://example.com/pricing",
      }).success,
    ).toBe(false);
  });

  test("savePageToKnowledgeInputSchema accepts optional title and trust level", () => {
    const parsed = savePageToKnowledgeInputSchema.parse({
      url: "https://example.com/docs",
      title: "Example Docs",
      trustLevel: "curated",
    });

    expect(parsed.title).toBe("Example Docs");
    expect(parsed.trustLevel).toBe("curated");
  });

  test("tools export web contracts", async () => {
    const mod = await import("./tools");

    expect("openUrlDef" in mod).toBe(true);
    expect("extractPageDef" in mod).toBe(true);
    expect("savePageToKnowledgeDef" in mod).toBe(true);
    expect("searchWebDef" in mod).toBe(false);
    expect("summarizePageDef" in mod).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试，确认它先失败**

Run: `bun test packages/contracts/src/execution-layer/web-tools.test.ts`

Expected: FAIL，提示 `./open-url`、`./extract-page`、`./save-page-to-knowledge` 模块不存在或未导出对应 schema。

- [ ] **Step 3: 写共享 schema 与三个 P0 contracts 的最小实现**

```ts
// packages/contracts/src/execution-layer/web-shared.ts
import { z } from "zod";

const webProviderSchema = z.enum(["webclaw"]);
const webRenderModeSchema = z.enum(["auto", "reader", "rendered"]);

const webPageDocumentSchema = z.object({
  url: z.url(),
  finalUrl: z.url(),
  title: z.string().trim().min(1).nullable(),
  siteName: z.string().trim().min(1).nullable(),
  byline: z.string().trim().min(1).nullable(),
  publishedAt: z.string().datetime().nullable(),
  language: z.string().trim().min(1).nullable(),
  excerpt: z.string().trim().min(1).nullable(),
  markdown: z.string(),
  plainText: z.string(),
  statusCode: z.number().int().positive().nullable(),
  extractionMethod: z.enum(["reader", "rendered", "provider"]),
  warnings: z.array(z.string()),
  fetchedAt: z.string().datetime(),
});

export {
  webPageDocumentSchema,
  webProviderSchema,
  webRenderModeSchema,
};
```

```ts
// packages/contracts/src/execution-layer/open-url.ts
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import {
  webPageDocumentSchema,
  webProviderSchema,
  webRenderModeSchema,
} from "./web-shared";

const openUrlInputSchema = z.object({
  url: z.url(),
  renderMode: webRenderModeSchema.default("auto"),
});

const openUrlOutputSchema = z.object({
  provider: webProviderSchema,
  document: webPageDocumentSchema,
});

const openUrlDef = toolDefinition({
  name: "open_url",
  description:
    "Fetch and normalize one web page into clean content plus metadata. Use this before saving a page to knowledge or before asking for detailed content analysis.",
  inputSchema: openUrlInputSchema,
  outputSchema: openUrlOutputSchema,
});

export { openUrlDef, openUrlInputSchema, openUrlOutputSchema };
```

```ts
// packages/contracts/src/execution-layer/extract-page.ts
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import {
  webPageDocumentSchema,
  webProviderSchema,
  webRenderModeSchema,
} from "./web-shared";

const extractPageInputSchema = z.object({
  url: z.url(),
  instruction: z.string().trim().min(1).max(2_000),
  schema: z.record(z.string(), z.unknown()).optional(),
  renderMode: webRenderModeSchema.default("auto"),
});

const extractPageOutputSchema = z.object({
  provider: webProviderSchema,
  document: webPageDocumentSchema,
  data: z.unknown(),
  generatedSchema: z.record(z.string(), z.unknown()).nullable(),
});

const extractPageDef = toolDefinition({
  name: "extract_page",
  description:
    "Extract structured JSON from a single web page. Use this when the user wants fields, entities, pricing tables, timelines, or other structured information from a URL.",
  inputSchema: extractPageInputSchema,
  outputSchema: extractPageOutputSchema,
});

export { extractPageDef, extractPageInputSchema, extractPageOutputSchema };
```

```ts
// packages/contracts/src/execution-layer/save-page-to-knowledge.ts
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { webRenderModeSchema } from "./web-shared";

const savePageToKnowledgeInputSchema = z.object({
  url: z.url(),
  title: z.string().trim().min(1).max(200).optional(),
  trustLevel: z.enum(["imported", "curated"]).default("imported"),
  renderMode: webRenderModeSchema.default("auto"),
});

const savePageToKnowledgeOutputSchema = z.object({
  saved: z.boolean(),
  documentId: z.string(),
  created: z.boolean(),
  chunkCount: z.number().int().nonnegative(),
  factCount: z.number().int().nonnegative(),
  sourceUri: z.url(),
  note: z.string().trim().min(1).optional(),
});

const savePageToKnowledgeDef = toolDefinition({
  name: "save_page_to_knowledge",
  description:
    "Fetch a web page, normalize it, and ingest it into Buni knowledge. Use this when the user explicitly wants to keep a page as reusable world knowledge.",
  inputSchema: savePageToKnowledgeInputSchema,
  outputSchema: savePageToKnowledgeOutputSchema,
});

export {
  savePageToKnowledgeDef,
  savePageToKnowledgeInputSchema,
  savePageToKnowledgeOutputSchema,
};
```

```ts
// packages/contracts/src/execution-layer/tools.ts
export * from "./open-url";
export * from "./extract-page";
export * from "./save-page-to-knowledge";
export * from "./web-shared";
```

- [ ] **Step 4: 重新运行 contract 测试，确认变绿**

Run: `bun test packages/contracts/src/execution-layer/web-tools.test.ts`

Expected: PASS

- [ ] **Step 5: 提交 contracts**

```bash
git add packages/contracts/src/execution-layer/web-shared.ts \
  packages/contracts/src/execution-layer/open-url.ts \
  packages/contracts/src/execution-layer/extract-page.ts \
  packages/contracts/src/execution-layer/save-page-to-knowledge.ts \
  packages/contracts/src/execution-layer/web-tools.test.ts \
  packages/contracts/src/execution-layer/tools.ts
git commit -m "feat: add p0 web tool contracts"
```

### Task 2: 接入 webclaw 并归一化页面结果

**Files:**
- Create: `apps/server/src/integrations/web/types.ts`
- Create: `apps/server/src/integrations/web/webclaw.ts`
- Create: `apps/server/src/integrations/web/webclaw.test.ts`
- Create: `apps/server/src/integrations/web/index.ts`
- Modify: `apps/server/.env.example`

- [ ] **Step 1: 先写 integration 测试，固定配置与归一化结果**

```ts
// apps/server/src/integrations/web/webclaw.test.ts
import { describe, expect, test } from "bun:test";

import {
  fetchWebclawExtract,
  fetchWebclawPage,
  readWebclawConfig,
} from "./webclaw";

describe("readWebclawConfig", () => {
  test("reads defaults for base url and timeout", () => {
    const originalBaseUrl = process.env.BUNI_WEBCLAW_BASE_URL;
    const originalTimeout = process.env.BUNI_WEB_TIMEOUT_MS;
    const originalProvider = process.env.BUNI_WEB_PROVIDER;
    const originalApiKey = process.env.BUNI_WEBCLAW_API_KEY;

    process.env.BUNI_WEBCLAW_BASE_URL = "";
    process.env.BUNI_WEB_TIMEOUT_MS = "";
    process.env.BUNI_WEB_PROVIDER = "webclaw";
    process.env.BUNI_WEBCLAW_API_KEY = "wc_test";

    const config = readWebclawConfig();

    expect(config.baseUrl).toBe("https://api.webclaw.io");
    expect(config.timeoutMs).toBe(10_000);
    expect(config.apiKey).toBe("wc_test");

    process.env.BUNI_WEBCLAW_BASE_URL = originalBaseUrl;
    process.env.BUNI_WEB_TIMEOUT_MS = originalTimeout;
    process.env.BUNI_WEB_PROVIDER = originalProvider;
    process.env.BUNI_WEBCLAW_API_KEY = originalApiKey;
  });
});

describe("fetchWebclawPage", () => {
  test("normalizes scrape payload into a WebPageDocument", async () => {
    const page = await fetchWebclawPage({
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
    const result = await fetchWebclawExtract({
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
```

- [ ] **Step 2: 运行测试，确认 integration 先失败**

Run: `bun test apps/server/src/integrations/web/webclaw.test.ts`

Expected: FAIL，提示 `./webclaw` 模块不存在。

- [ ] **Step 3: 写最小 integration 实现**

```ts
// apps/server/src/integrations/web/types.ts
type WebProviderName = "webclaw";

type WebPageDocument = {
  url: string;
  finalUrl: string;
  title: string | null;
  siteName: string | null;
  byline: string | null;
  publishedAt: string | null;
  language: string | null;
  excerpt: string | null;
  markdown: string;
  plainText: string;
  statusCode: number | null;
  extractionMethod: "reader" | "rendered" | "provider";
  warnings: string[];
  fetchedAt: string;
};

type WebPageResult = {
  provider: WebProviderName;
  document: WebPageDocument;
};

type WebExtractResult = {
  provider: WebProviderName;
  data: unknown;
  generatedSchema: Record<string, unknown> | null;
};

export type {
  WebExtractResult,
  WebPageDocument,
  WebPageResult,
  WebProviderName,
};
```

```ts
// apps/server/src/integrations/web/webclaw.ts
import type {
  WebExtractResult,
  WebPageResult,
} from "./types";

type WebclawConfig = {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
};

type WebclawDeps = {
  fetch: typeof fetch;
};

const DEFAULT_WEBCLAW_BASE_URL = "https://api.webclaw.io";
const DEFAULT_WEB_TIMEOUT_MS = 10_000;

const normalizeBaseUrl = (value: string) =>
  value.trim().replace(/\/+$/, "");

const toPositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
};

const readWebclawConfig = (): WebclawConfig => ({
  apiKey: process.env.BUNI_WEBCLAW_API_KEY?.trim() ?? "",
  baseUrl: normalizeBaseUrl(
    process.env.BUNI_WEBCLAW_BASE_URL?.trim() || DEFAULT_WEBCLAW_BASE_URL,
  ),
  timeoutMs: toPositiveInt(
    process.env.BUNI_WEB_TIMEOUT_MS,
    DEFAULT_WEB_TIMEOUT_MS,
  ),
});

const buildFetchSignal = (input: { timeoutMs: number; signal?: AbortSignal }) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error("Webclaw request timed out."));
  }, input.timeoutMs);

  const abortFromParent = () => controller.abort(input.signal?.reason);

  if (input.signal) {
    if (input.signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort(input.signal.reason);
    } else {
      input.signal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      input.signal?.removeEventListener("abort", abortFromParent);
    },
  };
};

const fetchWebclawJson = async <T>(input: {
  path: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
  config?: WebclawConfig;
  deps?: Partial<WebclawDeps>;
}): Promise<T> => {
  const config = input.config ?? readWebclawConfig();

  if (config.apiKey.length === 0) {
    throw new Error("Webclaw API key is not configured.");
  }

  const deps = { fetch, ...(input.deps ?? {}) };
  const request = buildFetchSignal({
    timeoutMs: config.timeoutMs,
    signal: input.signal,
  });

  try {
    const response = await deps.fetch(`${config.baseUrl}${input.path}`, {
      method: "POST",
      signal: request.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input.body),
    });

    if (!response.ok) {
      throw new Error(`Webclaw request failed (${response.status}): ${await response.text()}`);
    }

    return await response.json() as T;
  } finally {
    request.cleanup();
  }
};

const fetchWebclawPage = async (input: {
  url: string;
  signal?: AbortSignal;
  config?: WebclawConfig;
  deps?: Partial<WebclawDeps>;
}): Promise<WebPageResult> => {
  const payload = await fetchWebclawJson<{
    url?: string;
    metadata?: {
      title?: string | null;
      description?: string | null;
      author?: string | null;
      published_date?: string | null;
      language?: string | null;
      site_name?: string | null;
    };
    markdown?: string;
    text?: string;
  }>({
    path: "/v1/scrape",
    body: {
      url: input.url,
      formats: ["markdown", "text"],
      only_main_content: true,
    },
    signal: input.signal,
    config: input.config,
    deps: input.deps,
  });

  return {
    provider: "webclaw",
    document: {
      url: input.url,
      finalUrl: payload.url ?? input.url,
      title: payload.metadata?.title ?? null,
      siteName: payload.metadata?.site_name ?? null,
      byline: payload.metadata?.author ?? null,
      publishedAt: payload.metadata?.published_date ?? null,
      language: payload.metadata?.language ?? null,
      excerpt: payload.metadata?.description ?? null,
      markdown: payload.markdown ?? "",
      plainText: payload.text ?? payload.markdown ?? "",
      statusCode: 200,
      extractionMethod: "provider",
      warnings: [],
      fetchedAt: new Date().toISOString(),
    },
  };
};

const fetchWebclawExtract = async (input: {
  url: string;
  instruction: string;
  schema?: Record<string, unknown>;
  signal?: AbortSignal;
  config?: WebclawConfig;
  deps?: Partial<WebclawDeps>;
}): Promise<WebExtractResult> => {
  const payload = await fetchWebclawJson<{
    data?: unknown;
    generated_schema?: Record<string, unknown>;
  }>({
    path: "/v1/extract",
    body: {
      url: input.url,
      prompt: input.instruction,
      ...(input.schema ? { schema: input.schema } : {}),
    },
    signal: input.signal,
    config: input.config,
    deps: input.deps,
  });

  return {
    provider: "webclaw",
    data: payload.data ?? null,
    generatedSchema: payload.generated_schema ?? null,
  };
};

export {
  DEFAULT_WEB_TIMEOUT_MS,
  DEFAULT_WEBCLAW_BASE_URL,
  fetchWebclawExtract,
  fetchWebclawPage,
  readWebclawConfig,
};
```

```ts
// apps/server/.env.example
BUNI_WEB_PROVIDER=webclaw
BUNI_WEB_TIMEOUT_MS=10000
BUNI_WEBCLAW_BASE_URL=https://api.webclaw.io
BUNI_WEBCLAW_API_KEY=
```

- [ ] **Step 4: 跑 integration 测试**

Run: `bun test apps/server/src/integrations/web/webclaw.test.ts`

Expected: PASS

- [ ] **Step 5: 提交 integration 层**

```bash
git add apps/server/src/integrations/web/types.ts \
  apps/server/src/integrations/web/webclaw.ts \
  apps/server/src/integrations/web/webclaw.test.ts \
  apps/server/src/integrations/web/index.ts \
  apps/server/.env.example
git commit -m "feat: add webclaw integration for p0 web tools"
```

### Task 3: 实现 `open_url`、`extract_page`、`save_page_to_knowledge` handlers 与知识桥接

**Files:**
- Create: `apps/server/src/tools/open-url.ts`
- Create: `apps/server/src/tools/extract-page.ts`
- Create: `apps/server/src/tools/save-page-to-knowledge.ts`
- Create: `apps/server/src/web/save-web-page-to-knowledge.ts`
- Modify: `apps/server/src/tools/tool-sets.ts`
- Modify: `apps/server/src/tools/index.ts`
- Modify: `apps/server/src/tools/execution-tool-names.ts`
- Modify: `apps/server/src/tools/tool-sets.test.ts`

- [ ] **Step 1: 先写 tool set 测试，固定注册结果**

```ts
// apps/server/src/tools/tool-sets.test.ts
test("registers p0 web tools alongside other execution tools", () => {
  const tools = createExecutionTools(createToolContext());
  const toolNames = tools.map((tool) => tool.name as string);

  expect(toolNames.includes("open_url")).toBe(true);
  expect(toolNames.includes("extract_page")).toBe(true);
  expect(toolNames.includes("save_page_to_knowledge")).toBe(true);
  expect(toolNames.includes("search_web")).toBe(false);
  expect(toolNames.includes("summarize_page")).toBe(false);
});
```

- [ ] **Step 2: 运行测试，确认注册面先失败**

Run: `bun test apps/server/src/tools/tool-sets.test.ts`

Expected: FAIL，提示 `open_url`、`extract_page`、`save_page_to_knowledge` 尚未注册。

- [ ] **Step 3: 写知识桥接 helper**

```ts
// apps/server/src/web/save-web-page-to-knowledge.ts
import {
  getMemoryEmbeddingProviderConfig,
  getMemoryReasoningProviderConfig,
} from "@buni/db";

import { toOpenAICompatibleConfig } from "../digest/memory-provider-config";
import { ingestKnowledgeDocument } from "../memory/knowledge-ingest-service";
import type { WebPageDocument } from "../integrations/web/types";

const chooseKnowledgeContent = (document: WebPageDocument) =>
  document.markdown.trim().length > 0 ? document.markdown : document.plainText;

const saveWebPageToKnowledge = async (input: {
  profileId: string;
  url: string;
  title?: string;
  trustLevel: "imported" | "curated";
  document: WebPageDocument;
}) => {
  const [embeddingConfig, reasoningConfig] = await Promise.all([
    getMemoryEmbeddingProviderConfig(input.profileId),
    getMemoryReasoningProviderConfig(input.profileId),
  ]);

  return ingestKnowledgeDocument({
    profileId: input.profileId,
    title: input.title ?? input.document.title ?? input.url,
    content: chooseKnowledgeContent(input.document),
    sourceType: "web",
    sourceUri: input.document.finalUrl,
    trustLevel: input.trustLevel,
    scope: "profile",
    embeddingConfig: toOpenAICompatibleConfig(embeddingConfig),
    reasoningConfig: toOpenAICompatibleConfig(reasoningConfig),
  });
};

export { saveWebPageToKnowledge };
```

- [ ] **Step 4: 写三个 tool handlers 的最小实现**

```ts
// apps/server/src/tools/open-url.ts
import { appendEvent } from "@buni/db";
import {
  openUrlDef,
  openUrlInputSchema,
} from "@buni/contracts";

import { fetchWebclawPage } from "../integrations/web/webclaw";
import type { ServerToolContext } from "./types";

const createOpenUrlTool = (context: ServerToolContext) =>
  openUrlDef.server(async (args) => {
    const input = openUrlInputSchema.parse(args);
    const result = await fetchWebclawPage({
      url: input.url,
      signal: context.abortSignal,
    });

    await appendEvent(context.profileId, "tool.open_url", {
      conversationId: context.conversationId,
      turnId: context.turnId,
      provider: result.provider,
      url: input.url,
    });

    return result;
  });

export { createOpenUrlTool };
```

```ts
// apps/server/src/tools/extract-page.ts
import { appendEvent } from "@buni/db";
import {
  extractPageDef,
  extractPageInputSchema,
} from "@buni/contracts";

import {
  fetchWebclawExtract,
  fetchWebclawPage,
} from "../integrations/web/webclaw";
import type { ServerToolContext } from "./types";

const createExtractPageTool = (context: ServerToolContext) =>
  extractPageDef.server(async (args) => {
    const input = extractPageInputSchema.parse(args);
    const [page, extracted] = await Promise.all([
      fetchWebclawPage({
        url: input.url,
        signal: context.abortSignal,
      }),
      fetchWebclawExtract({
        url: input.url,
        instruction: input.instruction,
        schema: input.schema,
        signal: context.abortSignal,
      }),
    ]);

    await appendEvent(context.profileId, "tool.extract_page", {
      conversationId: context.conversationId,
      turnId: context.turnId,
      provider: extracted.provider,
      url: input.url,
    });

    return {
      provider: extracted.provider,
      document: page.document,
      data: extracted.data,
      generatedSchema: extracted.generatedSchema,
    };
  });

export { createExtractPageTool };
```

```ts
// apps/server/src/tools/save-page-to-knowledge.ts
import { appendEvent } from "@buni/db";
import {
  savePageToKnowledgeDef,
  savePageToKnowledgeInputSchema,
} from "@buni/contracts";

import { fetchWebclawPage } from "../integrations/web/webclaw";
import { saveWebPageToKnowledge } from "../web/save-web-page-to-knowledge";
import type { ServerToolContext } from "./types";

const createSavePageToKnowledgeTool = (context: ServerToolContext) =>
  savePageToKnowledgeDef.server(async (args) => {
    const input = savePageToKnowledgeInputSchema.parse(args);
    const page = await fetchWebclawPage({
      url: input.url,
      signal: context.abortSignal,
    });
    const data = await saveWebPageToKnowledge({
      profileId: context.profileId,
      url: input.url,
      title: input.title,
      trustLevel: input.trustLevel,
      document: page.document,
    });

    await appendEvent(context.profileId, "tool.save_page_to_knowledge", {
      conversationId: context.conversationId,
      turnId: context.turnId,
      provider: page.provider,
      url: input.url,
      documentId: data.documentId,
      created: data.created,
    });

    return {
      saved: true,
      documentId: data.documentId,
      created: data.created,
      chunkCount: data.chunkCount,
      factCount: data.factCount,
      sourceUri: page.document.finalUrl,
      note: data.created
        ? "Saved page to knowledge."
        : "Matching page already exists in knowledge.",
    };
  });

export { createSavePageToKnowledgeTool };
```

- [ ] **Step 5: 注册新工具并更新清单**

```ts
// apps/server/src/tools/tool-sets.ts
import { createExtractPageTool } from "./extract-page";
import { createOpenUrlTool } from "./open-url";
import { createSavePageToKnowledgeTool } from "./save-page-to-knowledge";

const createExecutionTools = (context: ServerToolContext) => [
  createCreateReflectionReportTool(context),
  createScheduleTool(context),
  createDeleteReflectionReportTool(context),
  createDeleteScheduleTool(context),
  createExtractPageTool(context),
  createGetScheduleTool(context),
  createGetReflectionReportTool(context),
  createGetNewsBriefTool(context),
  createGetNewsHeadlinesTool(context),
  createListFeishuDeliveryLogsTool(context),
  createListFeishuTargetsTool(context),
  createListNewsBriefsTool(context),
  createListNewsSourcesTool(context),
  createListReflectionReportsTool(context),
  createListSchedulesTool(context),
  createNowTool(context),
  createOpenUrlTool(context),
  createRenderReflectionReportToFeishuMessageTool(context),
  createResolveNewsSourceTool(context),
  createReminderTool(context),
  createSavePageToKnowledgeTool(context),
  createSearchNewsSourcesTool(context),
  createSendChatMessageTool(context),
  createSendFeishuMessageTool(context),
  createUpdateReflectionReportTool(context),
  createUpdateScheduleTool(context),
];
```

```ts
// apps/server/src/tools/execution-tool-names.ts
const executionToolNames = [
  "create_reflection_report",
  "create_schedule",
  "delete_reflection_report",
  "delete_schedule",
  "extract_page",
  "get_schedule",
  "get_reflection_report",
  "get_news_brief",
  "get_news_headlines",
  "list_feishu_delivery_logs",
  "list_feishu_targets",
  "list_news_briefs",
  "list_news_sources",
  "list_qq_targets",
  "list_reflection_reports",
  "list_schedules",
  "now",
  "open_url",
  "render_reflection_report_to_feishu_message",
  "resolve_news_source",
  "create_reminder",
  "save_page_to_knowledge",
  "search_news_sources",
  "send_chat_message",
  "send_feishu_message",
  "send_qq_message",
  "update_reflection_report",
  "update_schedule",
] as const;
```

- [ ] **Step 6: 运行工具层测试**

Run: `bun test apps/server/src/tools/tool-sets.test.ts`

Expected: PASS

- [ ] **Step 7: 提交 P0 handlers**

```bash
git add apps/server/src/tools/open-url.ts \
  apps/server/src/tools/extract-page.ts \
  apps/server/src/tools/save-page-to-knowledge.ts \
  apps/server/src/web/save-web-page-to-knowledge.ts \
  apps/server/src/tools/tool-sets.ts \
  apps/server/src/tools/index.ts \
  apps/server/src/tools/execution-tool-names.ts \
  apps/server/src/tools/tool-sets.test.ts
git commit -m "feat: add p0 web execution tools"
```

### Task 4: 做 P0 验证并补齐导出与文档

**Files:**
- Modify: `packages/contracts/src/execution-layer/tools.ts`
- Modify: `apps/server/.env.example`
- Modify: `docs/execution-layer/news-tools-v1.md` (不改逻辑，只补相关指引时才需要)

- [ ] **Step 1: 跑 contracts + integration + tools 的目标测试**

Run: `bun test packages/contracts/src/execution-layer/web-tools.test.ts apps/server/src/integrations/web/webclaw.test.ts apps/server/src/tools/tool-sets.test.ts`

Expected: PASS

- [ ] **Step 2: 跑最小 typecheck**

Run: `bun run typecheck:contracts && bun run typecheck:server`

Expected: 两段都 PASS

- [ ] **Step 3: 提交 P0 验证收口**

```bash
git add packages/contracts/src/execution-layer/tools.ts apps/server/.env.example
git commit -m "test: verify p0 web tools wiring"
```

### Task 5: 实现 `search_web`

**Files:**
- Create: `packages/contracts/src/execution-layer/search-web.ts`
- Create: `apps/server/src/tools/search-web.ts`
- Modify: `packages/contracts/src/execution-layer/web-shared.ts`
- Modify: `packages/contracts/src/execution-layer/tools.ts`
- Modify: `apps/server/src/tools/tool-sets.ts`
- Modify: `apps/server/src/tools/execution-tool-names.ts`
- Modify: `apps/server/src/tools/tool-sets.test.ts`
- Modify: `apps/server/src/integrations/web/webclaw.ts`
- Modify: `apps/server/src/integrations/web/webclaw.test.ts`

- [ ] **Step 1: 先写 `search_web` contract 测试**

```ts
test("searchWebInputSchema accepts query and optional domain filters", () => {
  const parsed = searchWebInputSchema.parse({
    query: "buni ai agents",
    domain: "github.com",
    limit: 5,
  });

  expect(parsed.query).toBe("buni ai agents");
  expect(parsed.domain).toBe("github.com");
  expect(parsed.limit).toBe(5);
});
```

- [ ] **Step 2: 实现最小 schema 与 `webclaw /v1/search` 适配**

```ts
const searchWebInputSchema = z.object({
  query: z.string().trim().min(1).max(300),
  domain: z.string().trim().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(10).default(5),
});

const result = await fetchWebclawSearch({
  query: input.domain ? `${input.query} site:${input.domain}` : input.query,
  limit: input.limit,
  signal: context.abortSignal,
});
```

- [ ] **Step 3: 验证搜索测试与 tool set 测试**

Run: `bun test packages/contracts/src/execution-layer/web-tools.test.ts apps/server/src/integrations/web/webclaw.test.ts apps/server/src/tools/tool-sets.test.ts`

Expected: PASS

- [ ] **Step 4: 提交 `search_web`**

```bash
git add packages/contracts/src/execution-layer/search-web.ts \
  apps/server/src/tools/search-web.ts \
  apps/server/src/integrations/web/webclaw.ts \
  apps/server/src/integrations/web/webclaw.test.ts \
  packages/contracts/src/execution-layer/web-shared.ts \
  packages/contracts/src/execution-layer/tools.ts \
  apps/server/src/tools/tool-sets.ts \
  apps/server/src/tools/execution-tool-names.ts \
  apps/server/src/tools/tool-sets.test.ts
git commit -m "feat: add search_web tool"
```

### Task 6: 实现 `summarize_page`

**Files:**
- Create: `packages/contracts/src/execution-layer/summarize-page.ts`
- Create: `apps/server/src/tools/summarize-page.ts`
- Create: `apps/server/src/web/summarize-web-page.ts`
- Create: `apps/server/src/web/summarize-web-page.test.ts`
- Modify: `packages/contracts/src/execution-layer/tools.ts`
- Modify: `apps/server/src/tools/tool-sets.ts`
- Modify: `apps/server/src/tools/execution-tool-names.ts`
- Modify: `apps/server/src/tools/tool-sets.test.ts`
- Modify: `apps/server/src/tools/web-tools.test.ts`

- [ ] **Step 1: 写 contract 测试，要求摘要长度受控**

```ts
test("summarizePageInputSchema defaults to medium length", () => {
  const parsed = summarizePageInputSchema.parse({
    url: "https://example.com/post",
  });

  expect(parsed.length).toBe("medium");
});
```

- [ ] **Step 2: 实现最小 `summarize_page`**

```ts
const summarizePageInputSchema = z.object({
  url: z.url(),
  goal: z.string().trim().min(1).max(1_000).optional(),
  length: z.enum(["short", "medium", "long"]).default("medium"),
});
```

```ts
const page = await fetchWebclawPage({
  url: input.url,
  signal: context.abortSignal,
});

const result = await summarizeWebPage({
  profileId: context.profileId,
  document: page.document,
  length: input.length,
  goal: input.goal,
  signal: context.abortSignal,
});
```

- [ ] **Step 3: 跑总结测试与 typecheck**

Run: `bun test packages/contracts/src/execution-layer/web-tools.test.ts apps/server/src/integrations/web/webclaw.test.ts apps/server/src/tools/web-tools.test.ts apps/server/src/tools/tool-sets.test.ts apps/server/src/web/summarize-web-page.test.ts && bun run typecheck:contracts && bun run typecheck:server`

Expected: PASS

- [ ] **Step 4: 提交 `summarize_page`**

```bash
git add packages/contracts/src/execution-layer/summarize-page.ts \
  apps/server/src/tools/summarize-page.ts \
  apps/server/src/web/summarize-web-page.ts \
  apps/server/src/web/summarize-web-page.test.ts \
  packages/contracts/src/execution-layer/tools.ts \
  apps/server/src/tools/tool-sets.ts \
  apps/server/src/tools/execution-tool-names.ts \
  apps/server/src/tools/tool-sets.test.ts \
  apps/server/src/tools/web-tools.test.ts
git commit -m "feat: add summarize_page tool"
```

## Self-Review

### Spec coverage

- P0 的 `open_url`、`extract_page`、`save_page_to_knowledge` 已分别覆盖 contracts、integration、handler、registration、knowledge bridge。
- P1 的 `search_web`、`summarize_page` 在 Task 5 和 Task 6 中单独拆开，避免 P0 交付被拖慢。
- provider-neutral 的边界体现在 `web-shared.ts` 和 `integrations/web/` 下的统一类型；首版仍只启用 `webclaw`，与 spec 一致。

### Placeholder scan

- 没有 `TODO`、`TBD`、`later` 一类占位符。
- 每个任务都给出了具体文件路径、代码片段和验证命令。
- `search_web` 和 `summarize_page` 没有“类似 Task N”式引用，而是独立给出最小代码方向。

### Type consistency

- P0 统一使用 `WebPageDocument`、`WebPageResult`、`WebExtractResult`。
- tool 名称统一为 `open_url`、`extract_page`、`save_page_to_knowledge`、`search_web`、`summarize_page`。
- `extract-page.ts` 的输出字段统一为 `data` 和 `generatedSchema`，避免与 `webclaw` 原始字段名直接耦合。
