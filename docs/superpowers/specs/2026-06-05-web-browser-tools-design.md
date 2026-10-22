---
title: "Buni Web / Browser Tools V1 设计稿"
---

# Buni Web / Browser Tools V1 设计稿

> 状态：draft
> 日期：2026-06-05
> 相关文档：
> - [../../execution-layer/tool-runtime-v1.md](../../execution-layer/tool-runtime-v1.md)
> - [../../execution-layer/news-tools-v1.md](../../execution-layer/news-tools-v1.md)
> - [../../../apps/server/src/routes/knowledge.ts](../../../apps/server/src/routes/knowledge.ts)
> - [../../../apps/server/src/memory/knowledge-ingest-service.ts](../../../apps/server/src/memory/knowledge-ingest-service.ts)

## 0. 目的

本文定义 Buni 第一版 Web / Browser execution tools 的设计方向。

这次要解决的不是“再造一个知识库”，而是补齐一组面向外部世界的网页研究与保存能力：

- `search_web`
- `open_url`
- `extract_page`
- `summarize_page`
- `save_page_to_knowledge`

目标是让 Buni 能对外部网页做受控的读取、抽取、摘要和入库，同时保持现有的：

- `packages/contracts` 只负责 contract
- `apps/server/src/tools` 只负责 tool handler
- `apps/server/src/integrations` 只负责第三方集成
- `apps/server/src/memory` 继续作为 knowledge ingest 与 recall 的唯一实现边界

## 1. 当前现状

Buni 当前已经有比较完整的内部 cognition 与 knowledge 能力，但缺少 world-facing 的 web execution surface。

### 1.1 已有能力

- chat tools 已经有明确的 contracts -> handlers -> tool sets 分层
- `knowledge` 已经支持文档导入、chunk、FTS、embedding、fact extraction
- mobile 端已经有 knowledge 页面和手动导入入口

### 1.2 缺失能力

当前缺的是“网页获取与归一化”这一层，具体表现为：

- 没有网页搜索工具
- 没有网页打开和正文抽取工具
- 没有网页摘要工具
- 没有把网页一键沉淀到 knowledge store 的工具

因此现在的问题不是 knowledge schema 不够，而是没有一个干净的 fetch / extract / summarize / save pipeline。

## 2. 设计目标

V1 需要满足：

- 保持 tool surface 正交，不把 vendor 的一体化语义直接暴露给模型
- 保持 extraction provider 可替换，不把 Buni 绑死在单一平台
- `save_page_to_knowledge` 复用现有 `knowledge-ingest-service`
- 让 `search_web`、`open_url`、`extract_page` 的职责边界清楚
- 尽量先用同步短生命周期调用，不引入新的异步任务系统
- 能在 Bun + Hono + 现有 server 架构里直接落地

## 3. 非目标

V1 不做：

- 通用浏览器自动化
- 登录态网站录制与会话管理
- 跨页研究代理工作流
- 站点级大规模异步 crawl orchestration
- RSS / 邮件 / 浏览器插件等新的 ingestion 通道
- 浏览器使用轨迹采集

这些能力都可以以后做，但不应该混入当前这版 execution tools。

## 4. 候选方案调研结论

本次主要参考两个项目：

- `ScrapeGraphAI`
- `webclaw`

### 4.1 ScrapeGraphAI

更接近 managed-first 的“抓取 / 抽取 / 搜索 / crawl / monitor”平台。

优点：

- 平台能力比较全
- 官方同时提供 API、SDK、MCP
- 适合快速接入 hosted 能力

代价：

- 平台语义比较重，容易把 Buni 的 tool surface 做成 vendor passthrough
- JS SDK 环境约束更强，不适合直接成为 Buni server 的基础抽象
- 如果直接围绕它的 MCP 或高级 API 设计 contract，后续替换成本会偏高

### 4.2 webclaw

更接近 extraction-first 的 web data API。

优点：

- 能力面和 Buni 所需的 `scrape / extract / search / summarize / crawl` 更贴近
- 更容易把它包进一个 provider adapter
- 可以先走 API 集成，再决定是否需要自托管或替换 provider

代价：

- self-hosted 与 hosted 能力不完全一致
- `search`、复杂 JS rendering、anti-bot 等能力更依赖 hosted 版本

### 4.3 结论

推荐策略不是“把 webclaw 原样接进来”，也不是“直接押 ScrapeGraphAI”。

推荐策略是：

1. Buni 自己定义 tool contracts
2. Buni 自己定义页面归一化模型
3. `webclaw` 作为第一优先 provider adapter
4. `ScrapeGraphAI` 作为后续可插拔 fallback provider

也就是：

```text
Buni tool contracts
  -> Buni web integration boundary
    -> webclaw adapter (primary)
    -> scrapegraph adapter (optional fallback)
  -> normalized web page result
  -> summarize / save orchestration
```

## 5. 总体架构

V1 采用下面的分层：

```text
packages/contracts/src/execution-layer/
  search-web.ts
  open-url.ts
  extract-page.ts
  summarize-page.ts
  save-page-to-knowledge.ts
  web-shared.ts

apps/server/src/tools/
  search-web.ts
  open-url.ts
  extract-page.ts
  summarize-page.ts
  save-page-to-knowledge.ts

apps/server/src/integrations/web/
  provider.ts
  types.ts
  normalize.ts
  webclaw.ts
  scrapegraph.ts

apps/server/src/web/
  summarize-web-page.ts
  save-web-page-to-knowledge.ts
```

职责分工：

- `contracts`
  - tool name
  - input schema
  - output schema
- `tools`
  - 参数校验
  - runtime context 注入
  - appendEvent
  - 组装 integration 与 orchestration
- `integrations/web`
  - 负责和外部 provider 通信
  - 把 vendor payload 归一化成 Buni 内部结构
- `web/*`
  - 负责“摘要”和“保存”这类组合流程
- `memory/*`
  - 继续作为 knowledge ingest 的唯一边界

## 6. 规范化后的内部数据模型

V1 不应该把第三方原始 payload 直接返回给模型。

建议新增内部归一化结构：

### 6.1 `WebSearchResultItem`

```ts
type WebSearchResultItem = {
  rank: number;
  title: string;
  url: string;
  snippet: string | null;
  sourceName: string | null;
  publishedAt: string | null;
};
```

### 6.2 `WebPageDocument`

```ts
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
```

设计原则：

- `open_url` 与 `extract_page` 都围绕这份归一化结果工作
- vendor 特有字段留在 integration 层，不进入公开 tool output
- `save_page_to_knowledge` 只消费这份归一化结果，不关心底层 provider

## 7. Tool Surface

### 7.1 `search_web`

用途：

- 面向“搜一下某个主题/某个站点/某类网页”
- 只返回候选列表，不返回正文

输入建议：

```ts
{
  query: string;
  limit?: number;
  domain?: string;
  freshness?: "day" | "week" | "month";
}
```

输出建议：

```ts
{
  provider: "webclaw" | "scrapegraph";
  query: string;
  count: number;
  items: WebSearchResultItem[];
}
```

约束：

- `search_web` 不能隐式入库
- `search_web` 不能假装自己返回了正文

### 7.2 `open_url`

用途：

- 面向“先打开这个 URL 看内容”
- 返回归一化网页正文与元信息

输入建议：

```ts
{
  url: string;
  renderMode?: "auto" | "reader" | "rendered";
}
```

输出建议：

```ts
{
  document: WebPageDocument;
}
```

约束：

- `open_url` 是 read tool
- 不做 schema extraction
- 不做 knowledge ingest

### 7.3 `extract_page`

用途：

- 面向“从这个页面抽指定结构”
- 比如抽作者、发布日期、价格、结论、要点

输入建议：

```ts
{
  url: string;
  instruction: string;
  schema?: Record<string, unknown>;
}
```

输出建议：

```ts
{
  document: WebPageDocument;
  extracted: Record<string, unknown>;
}
```

约束：

- `extract_page` 必须把抽取结果和来源页面一起返回
- 不能只回一坨无 provenance 的 JSON

### 7.4 `summarize_page`

用途：

- 面向“总结这个页面给我”
- 这是组合工具，不是 provider 原生能力的简单透传

建议实现：

1. 先走 `open_url`
2. 再走 Buni 自己的 reasoning provider 生成摘要

输入建议：

```ts
{
  url: string;
  goal?: string;
  length?: "short" | "medium" | "long";
}
```

输出建议：

```ts
{
  document: Pick<WebPageDocument, "url" | "finalUrl" | "title" | "siteName" | "publishedAt">;
  summary: string;
  notes: string[];
}
```

这样做的好处：

- 摘要风格由 Buni 控制
- extraction provider 只负责拿内容
- 后续换 provider 不影响摘要工具协议

### 7.5 `save_page_to_knowledge`

用途：

- 面向“把这篇网页存到 knowledge”
- 这是 V1 最重要的 world-to-knowledge bridge

建议实现：

1. 先走 `open_url`
2. 归一化成知识文档输入
3. 调现有 `ingestKnowledgeDocument`

输入建议：

```ts
{
  url: string;
  title?: string;
  trustLevel?: "imported" | "curated";
}
```

输出建议：

```ts
{
  saved: boolean;
  documentId: string;
  created: boolean;
  chunkCount: number;
  factCount: number;
  sourceUri: string;
  note?: string;
}
```

约束：

- `save_page_to_knowledge` 是唯一会对 knowledge store 产生写入的 web tool
- `open_url` / `extract_page` / `summarize_page` 都不能隐式写知识库

## 8. `save_page_to_knowledge` 与现有 knowledge 的衔接

这是本设计最关键的边界。

当前已有：

- `knowledgeDocumentCreateSchema`
- `POST /v1/knowledge`
- `ingestKnowledgeDocument`

V1 不需要为网页再发明一套单独的存储模型。

建议的 server 内部流程：

```text
save_page_to_knowledge(url)
  -> fetch/normalize WebPageDocument
  -> build KnowledgeDocumentCreateInput
  -> ingestKnowledgeDocument(...)
  -> appendEvent("tool.save_page_to_knowledge", ...)
```

归一化策略：

- `title`
  - 优先用户显式 title
  - 否则使用页面标题
- `content`
  - 优先 `markdown`
  - 如果 markdown 太差则回退 `plainText`
- `sourceType`
  - 固定为 `web`
- `sourceUri`
  - 使用输入 URL 或 final URL
- `trustLevel`
  - 默认 `imported`

这个设计的意义是：

- knowledge schema 不用改
- ingest 管线不用改
- 只是给现有 knowledge store 新增一种来源

## 9. Provider 适配层设计

### 9.1 为什么必须有 adapter

如果把 vendor SDK 或 MCP 语义直接暴露到 Buni tool surface，会带来三个问题：

- contract 会长成第三方产品的样子
- 后续切换 provider 成本高
- 测试会变成直接依赖外部平台行为

所以 V1 必须有：

```ts
type WebIntegrationProvider = {
  search(input): Promise<...>;
  open(input): Promise<WebPageDocument>;
  extract(input): Promise<...>;
};
```

`summarize` 和 `save` 不应属于 provider adapter，它们属于 Buni 自己的 orchestration。

### 9.2 Provider 选择

V1 推荐：

- primary: `webclaw`
- optional fallback: `scrapegraph`

原因：

- `webclaw` 更适合作为 extraction/search adapter
- `ScrapeGraphAI` 更适合作为补强或备选，而不是 Buni 的协议中心

## 10. 配置策略

V1 不建议现在就把 web 集成塞进现有 `provider_configs` 表。

原因：

- 当前 `provider_configs` 明显服务于 LLM provider slot
- 现有 slot 只有 `chat`、`memory_embedding`、`memory_reasoning`
- web provider 和 LLM provider 生命周期与能力模型不同

V1 建议先用 integration 级 env/config：

- `BUNI_WEB_PROVIDER`
- `BUNI_WEB_TIMEOUT_MS`
- `BUNI_WEBCLAW_BASE_URL`
- `BUNI_WEBCLAW_API_KEY`
- `BUNI_SCRAPEGRAPH_BASE_URL`
- `BUNI_SCRAPEGRAPH_API_KEY`

等 V1 跑顺后，再判断是否要做 profile-scoped web integration config。

## 11. 观测与事件

所有 web tools 都应该 appendEvent，最少记录：

- `conversationId`
- `turnId`
- `tool name`
- `provider`
- `url` 或 `query`
- `status`
- `saved documentId`（如果有）

建议事件名：

- `tool.search_web`
- `tool.open_url`
- `tool.extract_page`
- `tool.summarize_page`
- `tool.save_page_to_knowledge`

这样可以保证：

- 后续能做 runtime timeline
- 能回看研究与保存行为
- 不会把 world-facing tools 变成黑盒

## 12. 测试策略

V1 至少补四类测试：

### 12.1 contract tests

- 每个 tool module 都要有 input/output schema 边界测试

### 12.2 integration tests

- `webclaw.ts` 和 `scrapegraph.ts` 用 mock fetch 测正常与失败分支
- 验证 vendor payload 到 `WebPageDocument` 的归一化

### 12.3 tool handler tests

- 验证 handler 是否正确 appendEvent
- 验证 `save_page_to_knowledge` 是否调用 ingest 层

### 12.4 save flow tests

- 页面打开成功 -> knowledge 创建成功
- 页面重复保存 -> 命中 checksum 复用
- provider 失败 -> 明确报错，不假装已保存

## 13. 分阶段落地

### P0

先落最短闭环：

- `open_url`
- `extract_page`
- `save_page_to_knowledge`
- `webclaw` adapter

理由：

- 这三者已经能形成“读网页 -> 存 knowledge”的最短真实价值闭环
- 不依赖 search 就能先验证 provider adapter 和 save bridge

### P1

再补：

- `search_web`
- `summarize_page`

理由：

- `summarize_page` 依赖页面获取，但不依赖新的存储模型
- `search_web` 可能受 provider 部署形态影响，适合在 P0 跑通后补

### P2

后续再考虑：

- `crawl_site`
- `watch_site`
- 与 schedule 的周期刷新集成

这部分不进入 V1。

## 14. 主要风险与应对

### 风险 1：hosted 与 self-hosted 能力不一致

表现：

- 本地能跑 `open`，但 `search` 或 JS rendering 不完整

应对：

- contract 不暴露 vendor 假设
- P0 先只依赖 `open` / `extract` / `save`

### 风险 2：tool surface 被 vendor 反向塑形

表现：

- 模型被迫学习第三方 API 风格

应对：

- 先定义 Buni 自己的 Zod contracts
- provider 只做适配，不主导协议

### 风险 3：网页正文质量波动

表现：

- 有的页面 markdown 很干净，有的很差

应对：

- `WebPageDocument` 同时保留 `markdown` 与 `plainText`
- `warnings` 暴露内容质量问题

### 风险 4：摘要与搜索能力绑在同一个 vendor

表现：

- 一旦换 provider，摘要表现和结果风格一起漂移

应对：

- `summarize_page` 放在 Buni 自己的 orchestration 层
- extraction provider 只负责拿内容

## 15. 最终建议

V1 的推荐实现路径是：

```text
webclaw-primary adapter
  + Buni-owned contracts
  + Buni-owned normalized page model
  + Buni-owned summarize orchestration
  + existing knowledge-ingest-service reuse
```

不要做：

- 直接嵌第三方 MCP
- 直接把 vendor SDK 返回值透传给模型
- 为网页另造一套 knowledge 存储
- 在第一版里同时引入 crawl/watch/async jobs

## 16. 下一步

如果这份设计方向确认，下一步应写 implementation plan，按下面顺序拆任务：

1. `web-shared` contract 与 schema
2. `open_url` / `extract_page` / `save_page_to_knowledge`
3. `webclaw` adapter 与测试
4. `tool-sets.ts` 注册
5. `search_web` / `summarize_page`

