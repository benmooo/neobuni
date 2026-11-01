---
title: "Study Scout 设计文档"
---

# Study Scout 设计文档

> Status: Draft for review (design gate — no code until approved)
> Date: 2026-11-01
> Owner: study subtree of `apps/server/src/study`

## 1. 摘要

Study Scout 让 Buni 每天主动"上网找学过的、即将学的、学得不好的东西"相关的
优质材料（帖子、新闻、历年真题/案例解析），筛掉噪音后通过 Telegram 推送 2–3 条，
每条带可点击的动作：收藏到知识库、出 3 道延伸题写进 lesson 的自检、不感兴趣、过几天再看。

它补的是现有教材流水线的空白：目前教材只来自预置考纲 + 静态教材库
（`apps/server/src/study/textbook-retrieval.ts`），**不会去看互联网**。

## 2. 目标与非目标

### 目标

1. 每天 1 次「今日精选」摘要，最多 3 条候选，附来源域名、日期、一句话理由。
2. 候选与 `studyGoal` 的学习进度强相关：最近学过的概念 / 未来 3 天要学的节点 /
   掌握度 < 60% 的薄弱点。
3. 端到端可闭环：点「收藏」→ 正文抓取 → 入知识库并挂到对应 lesson；
   点「出题」→ 3 道延伸题出现在 app 的「检查点」tab。
4. 全程可观测（事件流）、可关闭（设置开关）、可复现（手动触发端点）。
5. 成本可预期：每天 ≤ 6 次搜索 + ≤ 3 次抓取 + 1 次 LLM 排序。

### 非目标（phase 1）

- 不支持普通 `goals` / `commitments`，只服务 study goal。
- 不接 NewsNow / RSS（先用 DeepSeek 搜索的 `site:`、`lang:`、`after:` 覆盖中文站点）。
- 不为条目建新表（全部状态走事件流 + 现有 `studyGoalConfig`）。
- 不做 PDF 全文解析（PDF 仅推送链接，收藏时才尝试抓取）。
- 不做"时时在线"的实时监控：一天一次摘要。

## 3. 现状与缺口

| 能力 | 现状 |
| --- | --- |
| 网页搜索 | `apps/server/src/tools/search-web.ts` → `apps/server/src/integrations/web/webclaw.ts`（**需要 `NEOBUNI_WEBCLAW_API_KEY`，当前为空**） |
| 页面抓取/摘要 | `apps/server/src/tools/open-url.ts`、`extract-page.ts`、`summarize-page.ts`、`apps/server/src/web/summarize-web-page.ts` |
| 存入知识库 | `apps/server/src/web/save-web-page-to-knowledge.ts` → `ingestKnowledgeDocument` |
| 主动推送 + 按钮 | `apps/server/src/study/reminder-worker.ts`、`nudge-service.ts`、`nudge-actions.ts`、`apps/server/src/integrations/telegram.ts` |
| 学习状态 | `useStudyGoalDetail` 的 `nodes` / `masteryByNode` / `sessions`，`StudyProgress` |
| 定时任务范式 | `apps/server/src/study/reminder-worker.ts`（`Effect` + 可注入 deps + tick） |

缺口：没有"兴趣 → 检索 → 打分 → 去重 → 推送 → 沉淀/反馈"的 pipeline；
且现有搜索后端不可用（Webclaw key 为空）。

## 4. 关键决策

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| 搜索后端 | **DeepSeek Search / Fetch API** | 官方独立端点、$0.75/1k 成功请求（业界最低档），响应自带 `rerank_score`（0–3）与 `authority`（0–4），等于免费送一层质量信号，可省掉 LLM 预筛 |
| Key 来源 | 独立的 `web_search` provider 槽位（`provider=deepseek`） | 搜索与推理是两种用途、两笔账单；OpenCode Go 只代理推理，不代理 `/v1/tools/*`。把搜索 key 借放在「记忆理解与路由」里，会在切换推理 provider 时误伤 Scout |
| 是否走 OpenCode Go 网关 | 否 | OpenCode 是纯推理网关（`https://opencode.ai/inference/go/openai/v1`，见 `packages/contracts/src/platform/config/provider.ts:22`），只转发 chat completion，不代理 `/v1/tools/*`；Search/Fetch 计费挂在 DeepSeek 平台余额上 |
| 排序 | 确定性过滤 + **1 次 LLM 调用** | 每条候选都过 LLM 会把日成本放大 10 倍；1 次批量排序足够 |
| 状态存储 | 事件流（`study.scout_*`） | 不建表；去重、抑制、观测都从事件推导，和 `reminder-worker` 的既有做法一致 |
| 每日预算 | 与 nudge **共用** `maxPerDay`（3 条/天） | 避免同一天既有开课提醒又有材料推送造成轰炸 |
| 触发时机 | 学习时段开始前 30 分钟，一天一次 | 用户选择「汇总」而非实时推送 |

### 4.1 DeepSeek Search / Fetch 参考（2026-10 文档）

```
POST https://api.deepseek.com/v1/tools/search
Authorization: Bearer <profile provider apiKey>
{ "query": "…", "count": 10, "need_content": false, "ori_question": "…" }
→ { "results": [ { rerank_score, title, url, snippet, summary, content, site_name, site_icon, date, authority } ] }

POST https://api.deepseek.com/v1/tools/fetch
{ "url": "https://…" }
→ { "title": "…", "content": "<markdown>" }
```

- `query` 支持 `site:` / `-site:` / `-word` / `"exact phrase"` / `lang:zh,en` / `after:` / `before:`。
- `count` 1–50，默认 10；`rerank_score ≥ 1.5` 视为高质量；`authority ≥ 3` 视为权威。
- 计费：Search、Fetch 各 **$0.75 / 1000 次成功请求**；空结果、失败、超时不收费。
- QPS：Search 100、Fetch 25（账号级）。
- 错误：401 key 无效、402 余额不足、403 Fetch 被策略拒绝、404 无可用正文、429 超 QPS、5xx/408 可重试。

## 5. 架构总览

```
cron tick (10 min, scout-worker)
   │  仅当：本地时间 ∈ [窗口起-30m, 窗口起) 且今天还没推过 且 scout 开启
   ▼
buildScoutProfile(goal, config, nodes, mastery, sessions)
   │  → { topics: [{label, kind, paper, nodeId}], examName, desiredOutcome, targetAt }
   ▼
buildScoutQueries(profile, localDate)          // 确定性模板，5 条
   ▼
searchDeepSeek(query, count=6) × 6             // DeepSeek Search API，并行
   ▼
filterCandidates(items, history, blocklist)    // 免费过滤：去重/分数/权威/时效/配额/负反馈
   ▼
rankCandidates(profile, candidates)            // 1 次 LLM：挑 ≤3 条 + 写 why + 映射 lessonId
   ▼
sendTelegramDigest(card, keyboard)             // 共用 nudge 预算与免打扰
   ▼
callback_query  sc:{action}:{idx}:{digestId}   // 收藏 / 出题 / 不感兴趣 / 过几天再看
```

## 6. 兴趣画像 `buildScoutProfile`

输入：`config`（`studyWindow` / `targetAt` / `timezone`）、`nodes`、`masteryByNode`、`sessions`、
`localDate`。输出纯数据（无 IO，便于单测）。

| 来源 | 取法 | 用途 |
| --- | --- | --- |
| 最近学过 | 近 14 天 `status === "completed"` 的 session 对应的 node，取 `concepts`，按出现次数排序取前 4 | 变体查询的主题 |
| 即将学 | `scheduledFor` 在未来 3 天内、`status !== "completed"` 的 node 的 `concepts`，取前 3 | 预习型材料 |
| 薄弱点 | `masteryByNode[nodeId] < 0.6` 且该 node 已有 session（已开始但没掌握） | 补习型材料，权重最高 |
| 考试元信息 | `goal.title`、`goal.desiredOutcome`、`config.targetAt`、paper 分布 | 真题/大纲类查询 |

主题去重后最多 6 个，每个带 `kind: "weak" | "recent" | "upcoming"`；
`weak` 优先占用名额。若一个主题都没有（全新 goal），退化为使用
`goal.title` + `desiredOutcome` 的关键词，并标记 `kind: "goal"`。

## 7. 查询生成 `buildScoutQueries`

确定性模板（不花 LLM），每个主题 6 条，按 `localDate` 轮换主题顺序，避免连续几天问同样的东西：

| # | 模板 | `kind` | 说明 |
| --- | --- | --- | --- |
| Q1 | `{keyword} 深度分析 after:{today-730d}` | `article` | 近期解析/案例 |
| Q2 | `site:{allowlistHost} {keyword} 真题` | `past-exam` | 白名单站点的真题页 |
| Q3 | `{keyword} 案例分析 真题 after:{today-730d}` | `past-exam` | 真题与案例 |
| Q4 | `{keyword} 实践经验 踩坑 after:{today-365d}` | `article` | 实战型帖子 |
| Q5 | `{keyword} 最新进展 新闻 after:{today-365d}` | `news` | 新闻/动态 |
| Q6 | `{keyword} 考试大纲 变化 after:{today-730d}` | `outline` | 大纲/政策变化 |

- `keyword` 取主题的第一个关键词（lessson 标题或 `syllabusRefs`），空则退回主题标签。
- 一次 sweep 最多发出 `QUERY_LIMIT = 8` 条查询，所以权重最高的主题拿到全部 6 条，第二个主题拿到前 2 条。

- `paperLabel` 由 `node.paper` 映射（`case` → 案例分析、`essay` → 论文、`tech` → 技术）。
- `allowlist` 来自 `config.scout.siteAllowlist`，默认
  `["ruankao.org.cn", "github.com", "zhihu.com", "juejin.cn"]`；空数组则 Q2 退化为 `"{examName}" 真题`。
- 恒定的排除子句追加到每条：`-site:facebook.com -site:x.com -site:pinterest.com`。
- 轮换：`topics[(dayIndex + i) % topics.length]`，保证 5 条 query 覆盖不同主题。

## 8. 检索层：`deepseek-search.ts` + provider 工厂

新增 `apps/server/src/integrations/web/deepseek-search.ts`：

```ts
searchDeepSeek(input: {
  apiKey: string;
  baseUrl?: string;      // 默认 https://api.deepseek.com
  count?: number;        // 1..50，默认 10
  needContent?: boolean; // 默认 false
  query: string;
  signal?: AbortSignal;
  timeoutMs?: number;    // 默认 12s
}): Promise<WebSearchResult>

fetchDeepSeekPage(input: {
  apiKey: string;
  baseUrl?: string;
  url: string;
  signal?: AbortSignal;
  timeoutMs?: number;    // 默认 25s
}): Promise<WebPageResult>
```

- 映射到现有 `apps/server/src/integrations/web/types.ts`：`WebProviderName` 增加 `"deepseek"`，
  `WebSearchResultItem` 增加 `rerankScore: number | null`、`authority: number | null`、
  `publishedAt` 复用（来自 `date`）。
- 错误统一抛 `WebSearchProviderError`（`code: "unauthorized" | "insufficient_balance" |
  "blocked" | "not_found" | "rate_limited" | "timeout" | "upstream"`），调用方据此决定
  重试 / 降级 / 静默。
- `apps/server/src/integrations/web/provider.ts`：
  `resolveWebProvider(profileId)` → **先读独立的 `web_search` 槽位**
  （`getWebSearchProviderConfig`）；槽位存在且启用且有 key → deepseek 实现
  （`baseUrl` 缺省 `https://api.deepseek.com`）；槽位存在但被停用/缺 key → `null`
  （显式关闭，不再回退）。只有**从未配置过该槽位**的 profile 才回退到旧行为：
  推理 provider 是 `deepseek` 或 host 为 `api.deepseek.com` → deepseek 实现；
  否则若有 `NEOBUNI_WEBCLAW_API_KEY` → webclaw；都没有 → `null`（scout 静默关闭）。

## 9. 过滤 `filterCandidates`（全部免费）

按顺序执行，任何一步丢弃即返回原因（写入事件，便于调参）：

| 步骤 | 规则 |
| --- | --- |
| 1. URL 归一化 | 去 `#fragment`、去 `utm_*` / `ref` / `spm` / `from` / `share_*` 参数、去尾部 `/`、host 小写；`http` → `https` |
| 2. 协议 | 只保留 `https`（PDF 链接照常推送，正文抓取失败时回复「这篇抓不到正文」） |
| 3. 分数 | `rerank_score < 1.5` 丢弃；若存活不足 5 条，放宽为按 `rerank_score` 取前 5 |
| 4. 权威 | `authority < 2` 丢弃；`authority === -1`（未知）仅当 `rerank_score ≥ 2.2` 保留 |
| 5. 时效 | `past-exam`/`outline` 距今 ≤ 3 年；`article` ≤ 18 个月；`news` ≤ 12 个月；`date === null` 仅当 `authority ≥ 3` 保留 |
| 6. 历史去重 | 与 `study.scout_sent` 事件里出现过的归一化 URL 相同 → 丢弃（永久） |
| 7. 负反馈 | 命中 `study.scout_feedback{action:"skip", host, topicKey}` 且 30 天内 → 丢弃 |
| 8. 配额 | 同一 host 每天 1 条；进入排序的候选总数上限 8 条（按 `rerank_score + authority` 排序后截断） |
| 9. 主题归属 | 每个候选标注 `topicKey`（来自命中的 query），供负反馈与观测用 |

## 10. 排序 `rankCandidates`（唯一 LLM 调用）

- 模型：profile 的 memory reasoning provider（当前 `deepseek`），temperature 0.2，`max_tokens ≤ 700`。
- 输入：`desiredOutcome`、考试日期、8 条候选（title / summary 截断 400 字 / site_name / date / authority / rerank_score / topicKey）。
- 输出（严格 JSON，zod 校验）：

```json
{
  "picks": [
    {
      "url": "https://…",
      "why": "≤ 60 字，说明这份材料解决了哪个具体问题",
      "lessonId": "node-id-or-empty",
      "kind": "article | news | outline | past-exam",
      "confidence": 0.82
    }
  ]
}
```

- 校验：`url` 必须属于输入候选集合；`confidence < 0.5` 丢弃；最多 3 条；
  `lessonId` 必须存在于 `nodes`，否则置空（不阻断推送）。
- 失败降级：LLM 报错 / JSON 非法 / 全部被拒 → 启发式排序
  `score = 0.6 × rerank_score/3 + 0.25 × authority/4 + 0.15 × recency`，取前 2 条，
  `why` 用 `summary` 首句（≤ 40 字），并记 `study.scout_run{fallback: true}`。

## 11. 推送：Telegram 摘要卡片

```
📚 今日精选 · 3 条

1. 系统架构设计师 2025 上半年 案例分析真题解析
   ruankao.org.cn · 2025-05-24 · 真题
   为什么值得看：质量属性场景题的标准答法，正好补你 <60% 的那一节
   <两行摘要，≤ 80 字>

2. …
```

键盘（`callback_data` ≤ 64 字节，`digestId` 取 `study.scout_sent` 事件的短 id）：

```
[ 收藏 1 ] [ 收藏 2 ] [ 收藏 3 ]
[ 出题 2 ] [ 不感兴趣 1 ] [ 过几天再看 ]
```

- `callback_data` 格式：`sc:{action}:{index}:{digestId}`，
  `action ∈ {save, quiz, skip, later}`，`index` 从 0 开始（与 `study.scout_sent.items` 下标一致）。
  示例：`sc:save:1:9f3a1c7e`。
- 空候选 → 当天**不发任何消息**（不发"没找到"的噪音），只记事件。
- 预算与免打扰完全复用 `apps/server/src/study/reminder-worker.ts`：
  `budget = maxPerDay - sentToday`（nudge 与 scout 共用），`isWithinQuietHours` 命中则跳过。

## 12. 回调与动作 `scout-actions.ts`

统一入口 `applyScoutAction({ action, digestId, index, profileId })`，幂等：
同一 `(digestId, index, action)` 重复点击直接回「已经处理过了」。

| 动作 | 行为 | 持久化 |
| --- | --- | --- |
| `save` | `fetchDeepSeekPage`（1 次重试 on 429/5xx）→ 构建 `WebPageDocument`（`extractionMethod: "provider"`）→ `saveWebPageToKnowledge({ trustLevel: "imported" })` → 把 URL 追加进 `node.enrichment.resources`（去重、上限 8 条；lesson 尚未 AI 细化时用 `objective/whatText/howText/checkSpecs` 合成一份合法 enrichment，保证 lesson 页「参考资料」立刻可见；`checkSpecs < 3` 时跳过写回，避免破坏契约） | `study.scout_saved{url, documentId, goalId, planNodeId, lessonTitle}`；回复「✅ 已收藏到「<lesson>」的资料里」 |
| `quiz` | 用正文（截断 6k 字）生成 3 条 `studyCheckSpec`，prompt 前缀 `材料延伸：` | 写入 `node.enrichment.checkSpecs`（契约从「恰好 3 条」放宽为 `min 3, max 6`）；`study.scout_quiz{url, nodeId, specs}`；回复 deep link `NEOBUNI_APP_URL/study/{goalId}/lesson/{planNodeId}?tab=checks` |
| `skip` | 记录负反馈 | `study.scout_feedback{action:"skip", host, topicKey, url}`；回复「以后少推这类」 |
| `later` | 不落库，事件里带 `reofferOn = localDate + 1` | `study.scout_feedback{action:"later", …}`；次日 `filterCandidates` 允许重新入选（不受第 9 节第 6 步永久去重约束，改为 7 天后才可再推） |

`quiz` 的契约放宽是本次唯一的 schema 变更：`packages/contracts/src/study/index.ts`
的 `studyLessonEnrichmentSchema.checkSpecs` 由 `.min(3).max(3)` 改为 `.min(3).max(6)`，
并同步更新 `apps/server/src/study/enrichment-service.ts` 的既有断言（生成路径仍固定 3 条）。

## 13. 数据与事件

全部状态从事件推导，不新增表：

| 事件 | payload | 用途 |
| --- | --- | --- |
| `study.scout_run` | `{ goalId, localDate, queries: string[], candidates: number, kept: number, picked: number, fallback?: boolean, provider: "deepseek" \| "webclaw" }` | 观测/调参 |
| `study.scout_sent` | `{ candidates, digestId, errors, goalId, items: [{host, kind, title, topicKey, url}], localDate, picks }` | 推送历史（URL 与 `localDate` 去重来源）、按钮索引、`digestId`、收藏/出题的标题 |
| `study.scout_saved` | `{ digestId, documentId, goalId, planNodeId, url }` | 沉淀追踪 |
| `study.scout_quiz` | `{ digestId, goalId, nodeId, url, specIds }` | 出题追踪 |
| `study.scout_feedback` | `{ digestId, action: "skip" \| "later", host, topicKey, url, reofferOn? }` | 负反馈抑制 / 延后 |
| `study.scout_error` | `{ goalId, code, message }` | 失败观测（402/429 等） |

## 14. API 契约

`packages/contracts/src/study/index.ts` 新增：

```ts
studyScoutSettingsSchema = {
  enabled: boolean,          // 默认 true
  perDay: number,            // 1..3，默认 2
  siteAllowlist: string[],   // 默认四个站点
  minRerankScore: number,    // 默认 1.5
}
// 挂进 studyGoalConfigSchema 作为可选字段：scout: studyScoutSettingsSchema.optional()
```

服务端（`apps/server/src/routers/study.ts`，`tags: ["Study"]`）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/study/goals/{goalId}/scout/run` | 手动跑一次完整 pipeline，**只返回候选与理由，不推送**（预览用） |
| `GET` | `/study/goals/{goalId}/scout/latest` | 最近一次 `study.scout_sent` / `study.scout_run` 的摘要，供设置页与 /ops 显示 |

两条路由都要加入 `apps/server/src/routes/study.openapi.test.ts` 与
`apps/server/src/routes/api.openapi.test.ts` 的路由白名单（顺序敏感，2 空格缩进）。

搜索密钥不走 study 路由，而是 provider 配置（`packages/api/src/routers/config.ts`，
`tags: ["Config"]`，写入 `provider_configs.slot = "web_search"`）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/config/provider/web-search` | 读取独立的 Search/Fetch provider（apiKey / baseUrl / enabled） |
| `PUT` | `/config/provider/web-search` | 写入 `web_search` 槽位；provider 固定 `deepseek`，与推理 provider 互不影响 |

## 15. 设置与 UI

`apps/web/src/features/settings/provider-sections.tsx` 新增「联网搜索」卡片：
API Key、Base URL（默认 `https://api.deepseek.com`）、启用开关。它与
「记忆理解与路由」是两套配置——搜索 key 只服务 Search/Fetch，按
$0.75 / 1000 次请求计入 DeepSeek 平台余额。

`apps/web/src/features/study/study-settings-section.tsx` 的「每日精选材料」卡片：

- 开关（`scout.enabled`）、每日条数（1–3）、站点白名单（逗号分隔输入）、「立刻找一次」按钮 → `scout/run`，把预览结果列在卡片下方。
- `scout.enabled === false` 时 worker 整条目标跳过（不发文、不计入 `goalCount`），手动「立刻找一次」仍然可用——那是用户显式发起的预览，不会推送。
- 检索目标取自 lesson 的最近完成、即将到期与掌握度 < 60% 三类；`listStudyMastery` 在每次 sweep 与预览中都会读取，薄弱课节权重最高。
- 没有可用搜索 provider 时：开关置灰并显示「当前 profile 未配置 DeepSeek key，无法联网检索」。
- 与现有 `每日最多 3 条` 的说明合并成一句，避免两套配额文案。

## 16. 失败模式

| 场景 | 行为 |
| --- | --- |
| 无 provider / 无 key | scout 静默关闭；`scout/run` 返回 `{ available: false, reason }`；设置页置灰 |
| `402` 余额不足 | 记 `study.scout_error`，当天不再重试，向用户一次性 Telegram 提示「DeepSeek 余额不足，材料推送暂停」 |
| `429` QPS | 指数退避（1s → 3s，最多 2 次）；仍失败则跳过该 query，其它 query 继续 |
| `404` Fetch 无正文 | 收藏失败时回复「这篇抓不到正文，点标题直接看原文」，不改其他状态 |
| LLM 超时/非法 JSON | 启发式降级（第 10 节），推送照常 |
| 候选为空 | 当天不发消息，只记事件（`study.scout_run`） |
| 同一条被点两次 | `study.scout_saved` / `study.scout_quiz` 已带 `(digestId, index)`，重复点击回复「这一条已经处理过了。」 |
| 时钟/时区异常 | 全部基于 `config.timezone` 的本地日期计算，与 `nudge-service` 共用 `clockToMinutes` |

## 17. 成本模型

按默认参数（每天 1 次摘要、5 条 query、≤3 次抓取、1 次 LLM 排序）：

| 项 | 每天 | 每月 |
| --- | --- | --- |
| Search（5 次成功） | 5 × $0.00075 = $0.00375 | $0.11 |
| Fetch（≤3 次，仅当用户点收藏/出题） | 3 × $0.00075 = $0.00225 | $0.07 |
| LLM 排序（1 次，~2.5k 输入 / 0.7k 输出） | ≈ $0.001 | ≈ $0.03 |
| **合计** | **≈ $0.007** | **≈ $0.21** |

对比：若每条候选都单独过 LLM（9 条）或改用 Exa（$7/1k），成本会放大 5–10 倍。

## 18. 隐私与安全

- 复用 DB provider key，**不新增 env、不落日志**；任何错误信息在写事件前过滤 `Authorization` 与 key 片段。
- 抓到的正文只在用户点「收藏」后才入库（`trustLevel: "imported"`），不以明文存进事件。
- URL 只推 `https`；`siteAllowlist` 之外的发现在事件里保留域名，便于用户排查。
- 推送文案只描述"这是什么材料"，**不生成断言式结论**，避免把未核实的说法变成"学习内容"。
- 所有推送都带来源域名与日期，用户可自行判断可信度。

## 19. 测试计划

| 层 | 内容 |
| --- | --- |
| 单测 `deepseek-search.test.ts` | 请求构造（`site:`/`lang:`/`after:` 透传）、响应映射（`rerank_score`/`authority`/`date`）、错误码映射（401/402/403/404/429/超时），`fetch` 注入 |
| 单测 `scout-service.test.ts` | 画像（无进度/仅 weak/仅 upcoming）、query 轮换与 `year` 计算、URL 归一化、分数/权威/时效阈值、host 配额、负反馈抑制、`later` 重投、LLM JSON 非法时的启发式降级 |
| 单测 `scout-actions.test.ts` | 四个动作的幂等、`quiz` 写 `enrichment.checkSpecs`（3+3=6）、`skip` 生成抑制键、`save` 失败路径 |
| 集成 `scout-worker.test.ts` | 触发窗口 `[start-30m, start)` 半开区间、与 nudge 共用预算、免打扰、无 provider 静默、空候选不发消息 |
| 路由 | `study.openapi.test.ts` / `api.openapi.test.ts` 路由白名单；`scout/run` 的返回结构 |
| 手动 | 先跑 `DATABASE_URL="file:$PWD/.data/local.db" bun run apps/server/scripts/study-scout-smoke.ts`（无 auth、无 server，直接验证 provider 解析 + 过滤 + 排序），或 `POST /study/goals/{id}/scout/run`，确认候选、理由、去重生效；在 Telegram 里点四个按钮各一次 |

验证命令：`bun run check-types`、`apps/server` + `packages/db` + `packages/core` 的 `vp test run`、
`apps/web` 的 `tsc --noEmit` 与 `vp build`、`bunx ultracite check`。

## 20. 交付切分

| 阶段 | 内容 | 对应任务 |
| --- | --- | --- |
| P0 | provider + 画像/query/过滤/排序 + worker + 纯文本摘要 + `scout/run` | `search-provider`、`scout-service`、`scout-worker` |
| P1 | 四个按钮 + 回调 + 收藏入库 + 出题 + 负反馈 | `telegram-actions`、`scout-actions` |
| P2 | 契约与端点、设置 UI、/ops 观测、全量验证 | `study-api`、`web-settings`、`verify-ship` |

## 21. 风险与开放问题

1. **中文真题可搜性**：`ruankao.org.cn` 等站点若被搜索索引覆盖不足，Q2 会长期空转 → 兜底是把白名单换成用户提供的具体 URL 列表（P2 设置项已预留）。
2. **摘要质量**：DeepSeek 的 `summary` 是通用摘要，可能偏泛 → 靠 `why` 一句话补足"为什么现在值得看"。
3. **契约放宽**（`checkSpecs` 3→6）需要同步检查 app 端「检查点」tab 的渲染与判分是否假设恰好 3 题。
4. **预算竞争**：材料推送会挤占 nudge 的 3 条预算，可能出现"今天只收到材料、没收到开课提醒" → 顺序上 nudge 优先，scout 只在剩余预算里花。
