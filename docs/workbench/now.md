---
title: "Current Focus"
---

# Current Focus

Updated At: 2026-11-02 19:05 Asia/Shanghai
Active Feature: initiative-study-journey (live loop running) / study-scout (search provider wired)
Status: chat knowledge tools + DeepSeek-only web tools implemented, awaiting manual verification

## Why

Port（buni → neobuni）已经完成并且健康：90 个测试文件 / 277 个测试全绿、typecheck 与 Ultracite 通过、`/` 健康检查正常。
但本地库只有 5 次对话、0 条记忆、0 个目标、0 个日程，说明产品价值还没有被真正跑通。

下一阶段的重点是 **Initiative**：让 Buni 围绕用户目标持续地计划、提醒、教学、检验并量化进展。
第一个垂直场景改为 **Study Journey（软考 · 系统架构设计师）**，用一条完整学习闭环倒逼 Decision OS 精简。

## Implemented, Pending Verification (2026-11-02)

来源：对话 `52fb985e-5065-4d6a-8bf7-43074f28d6a4`（2026-11-02 09:31–09:33Z）。

### P1 · 聊天侧已能读教材

- 新增 `search_knowledge` / `list_knowledge` 聊天工具
  （`apps/server/src/tools/search-knowledge.ts`、`list-knowledge.ts`，
  契约在 `packages/contracts/src/execution-layer/knowledge-tools.ts`）。
  `search_knowledge` 返回 `documentTitle / chapter / page / locator / text`，
  描述里明确要求引用 `第N章 p.X`；`list_knowledge` 返回文档与 chunk 数。
- `memory/knowledge-store.ts` 抽出共享的 `searchKnowledge`，`recallKnowledge`
  与聊天工具共用；`parseChunkLocator` 移到 `memory/knowledge-locator.ts`。
- `packages/core/src/cognition/retrieval-signals.ts` 的
  `worldKnowledgePatterns` 增加「教材 / 课本 / 教科书 / 原文 / 页码 /
  textbook / chapter / 第几章 / 哪一章 / 第几节 / 哪一节」。
- 修掉 FTS bm25 打分 bug（`1 - max(0, rank)` 把所有命中都算成 1.0），
  并让向量命中优先、关键词命中降权，避免中文 FTS 噪声压过语义结果。
- 知识工具只在私有 surface 暴露；没有加进 `surface-policy.ts` 的
  public-safe allowlist，避免群聊泄漏私有知识库。
- 实测：`list_knowledge` → 682 chunks；`search_knowledge("计算机组成与体系结构
  存储层次 缓存 总线")` 第一条是 `第2章 计算机系统基础知识 · p.35-36`。
- 待验证：重启 server，在聊天里问「教材里这个对应哪几章」，确认模型调用
  `search_knowledge` 并引用 `第2章 p.X`。

### P2 · 联网工具已统一走 DeepSeek

- Webclaw 已整体删除：`integrations/web/webclaw.ts`、测试、env schema、
  contracts 的 `webclaw` literal 和 `renderMode` 全部移除。
- `search_web` / `fetch_page` / `summarize_page` / `save_page_to_knowledge`
  改为 `requireWebProvider(profileId)` + `searchWithProvider` /
  `fetchPageWithProvider`；未配置时返回可操作错误：
  `No web search provider configured. Set a DeepSeek API key in Settings → 模型与记忆 → 联网搜索.`
  `open_url` 已改名为 `fetch_page`（事件 `tool.fetch_page`），语义与
  `extract_page` / `summarize_page` 以及 DeepSeek `/v1/tools/fetch` 对齐。
- `extract_page` = DeepSeek `/v1/tools/fetch` 抓正文 + reasoning provider
  按 instruction/schema 输出 JSON（`apps/server/src/web/extract-web-page.ts`），
  不再依赖 Webclaw 的结构化抽取端点。
- 实测：`resolveWebProvider` → `deepseek`；`searchWithProvider` 返回 3 条结果，
  不需要 `NEOBUNI_WEBCLAW_API_KEY`。
- 待验证：聊天里各调用一次 `search_web` / `fetch_page` / `summarize_page`。

## Last Done

- 确认端口、typecheck、测试、lint 全部健康。
- 完成 `Initiative · Study Journey` 设计：目标模型、计划树、会话、检查、掌握度、就绪度、主动推送、API/UI、分阶段重构与验收清单。
- 确认四项范围决策：默认 2027-05 / 90 分钟 / 6 天；Jev 归档；P1 先行；学习提醒走独立确定性推送。
- **P1 完成（2026-10-25）**：Jev / shadow / release gate / evaluation replay 归档到 `experiments/decision-os/`；契约、DB repo、API、设置页与 Now 首屏同步收敛；测试 238 个全绿，typecheck 与 Ultracite 通过。
- **P2 完成（2026-10-25）**：新增 `study_*` 契约与 6 张表（`study_goal_configs`、`study_plans`、`study_plan_nodes`、`study_sessions`、`study_checks`、`study_mastery`）+ drizzle 迁移；`packages/core/src/study` 实现计划校验、会话排期、掌握度更新、进度/就绪度计算；新增 20 个单测，全量 258 个测试绿。
- **P3-1 完成（2026-10-25）**：自编「系统架构设计师」主题表 v0，11 模块 / 62 主题 / 6300 分钟，含科目归属、权重、学习目标、怎么学、检查角度；模板契约与 6 个一致性测试。
- **P3-2 / P4-1 完成（2026-10-25）**：确定性展开为 150 个左右小课（全部 ≤45 分钟、覆盖 62 个 topic）；新增 study repos、`study.goals.create`、`plans.generate/get/activate`、`today`、`progress`、`sessions.complete/skip/reschedule`；本地库已应用迁移。
- **P4-2 完成（2026-10-25）**：`study.checks.submit` 支持 3 题判分（reasoning provider，失败回退确定性评分）、写回 mastery、未通过自动安排次日复习；新增 grading-service 与 router 测试。
- **P5-1 完成（2026-10-25）**：Now 接入学习驾驶舱——一步创建目标/生成计划/激活排期，展示今天这一步、what/how、完成并检查、三科就绪度、未来 7 天安排；`study.goals.list` 与 `study.goals.start` 已上线。
- **P5/P6 完成（2026-10-25）**：新增 `/study/$goalId` 旅程页（三科就绪度、掌握度热力图、完整计划树、最近学习）、Settings > 学习（节奏、休息日、静默时段、提醒渠道、重新生成排期）、确定性 reminder worker（提前 60 分钟、每天最多 2 条、静默时段、幂等、reschedule 后重发）、`study_today` / `study_progress` 聊天工具。
- **端到端集成测试（2026-10-25）**：真实 DB 上跑通创建目标 → 生成/排期 → 读取今天 → 提交检查 → 掌握度 → 间隔复习；全量 291 个测试绿。
- **节奏优化（2026-10-25）**：新增 `maxNewPerDay`，把 150 节课按考试日均匀铺开，避免 70 天学完、后面空窗。
- **重排连续性（2026-10-25）**：重新生成计划时按稳定 key 继承掌握度；已掌握课程不再重排为新 lesson；覆盖率/剩余时间把 mastery 计入；重排时补回间隔复习 session。
- **LLM 内容细化（2026-10-25）**：`study.lessons.enrich` 按需把一节课的 what/how 与 3 道检查题改写得具体、可执行；结果缓存在 `study_plan_nodes.enrichment_json`；严格 Zod 校验，provider 缺失或失败时回退确定性内容；Now 增加"用 AI 细化这节课"与 AI 徽标。全量 296 个测试绿。
- **教材级学习内容（2026-10-25）**：官方教材 PDF 入库（721 页 → 682 chunks，带「第N章 · p.X」定位，cMap 修复中文抽取），682 条 embedding 入库；新增 62 主题 → 教材章节映射、按章节过滤的向量检索、以及基于原文生成 `教材内容`（3-4 节 + 原文摘录 + 页码引用）。`enrichment_json.material` 缓存，Now 卡片渲染「教材内容 / 原文摘录（N 段）」。实测一节：4 节内容 + 5 段第7章原文，25-40s。全量 320 个测试绿。
- **OpenCode provider 联调（2026-10-25）**：真实试跑发现三个问题并修复——① Go 有独立端点命名空间 `/inference/go/...`，指向 Console 路径会 402；② `enrichStudyLesson` 把"没有 provider"和"provider 调用失败"都返回 null，掩盖了真实错误，现在分为 `missing_provider` / `provider_error` 并在 API 层返回 `BAD_GATEWAY` 携带真实信息；③ 推理模型的 `reasoning_content` 计入 `max_tokens`，冗长 prompt 导致 JSON 截断，现在 prompt 有明确字数上限、`maxTokens` 提到 3000、并对拒绝 temperature 的模型（如 kimi-k2.7-code）自动重试。实测：细化 11.3s 成功、判分 4.3s（LLM 0.85 分）。默认模型改为 `deepseek-v4.1-flash`。全量 314 个测试绿。
- **OpenCode provider（2026-10-25）**：新增 `opencode` vendor（OpenAI 协议、Base URL `https://opencode.ai/inference/openai/v1`）、`glm-5.3-flash` 默认模型、模型目录拉取（`config.providerModels`）、`User-Agent` / `x-opencode-session` 头、study 侧稳定 session id；无迁移。全量 310 个测试绿，typecheck 与 Ultracite 通过。
- **聊天检查工具（2026-10-27）**：新增 `study_quiz`（返回今日课程的 3 道题，不暴露 rubric/答案）+ `study_quiz_submit`（判分并持久化）；提交逻辑抽到 `study/check-service.ts`，REST 与聊天共用同一套 check 写入、掌握度更新、session 完成与间隔复习。全量 307 个测试绿。
- **Study OpenAPI（2026-10-27）**：15 个 study 过程补齐 `method` / `path` / `summary` / `description` / `tags`，从默认 `POST /study/x/y` 收敛为 `/study/goals`、`/study/goals/{goalId}/today`、`/study/sessions/{sessionId}/checks` 等 REST 路径；新增 `routes/study.openapi.test.ts` 锁定生成结果。RPC 客户端路径不受影响。全量 309 个测试绿。
- **OpenAPI 全量铺开（2026-10-30）**：其余 77 个 procedure（`packages/api/src/routers/*` 的 67 个 + `apps/server/src/routers/extras.ts` 的 25 个覆盖/新增）全部补上 `.route(...)`，92 个 operation 不再有默认 `POST /namespace/name` 形态；标签收敛为 17 个（Goals / Memories / Config / Study / ...）。新增 `routes/api.openapi.test.ts`：锁定 `METHOD /path → tag` 全表、每个 operation 的 id/summary/description/唯一标签、路径参数必须是 `in: path` 且 required，并断言 92 条文档路由都能被 `OpenAPIHandler` 真实匹配。全量 93 个测试文件 / 338 个测试绿，typecheck 与 Ultracite 通过。
- **Study Scout 设计（2026-10-30）**：设计文档落在 `apps/fumadocs/content/docs/buni/study/study-scout.md`（根目录 `docs/study-scout.md` 只做指向），要点是每天 1 条「今日精选」、DeepSeek Search/Fetch、事件流存储、与 nudge 共享每日预算。
- **Study Scout P0（2026-10-31）**：DeepSeek Search/Fetch 客户端、兴趣画像、5–8 条确定性 query、免费过滤（分数/权威/时效/去重/host 配额/负反馈）、一次 LLM 排序、scout worker、`study.scout_*` 事件，以及 `POST /study/goals/{goalId}/scout/run` 预览端点。
- **Study Scout P1（2026-10-31）**：Telegram 摘要卡片 + 四个按钮（收藏到知识库 / 出 3 道延伸题 / 不感兴趣 / 明晚再看），`scout-actions.ts` 负责幂等与 7 天抑制。
- **Study Scout P2 / 联调（2026-11-01）**：设置页 scout 开关与每日条数、`scout/latest`、预算双向共享（nudge 优先）、按 provider 分派搜索（搜索 key 不再发错端点）、scout 开关按「DeepSeek-capable」门控、收藏条目挂到 lesson 参考资料、`study.scout_saved/quiz` 带 item index 保证重复点击幂等。新增 `apps/server/scripts/study-scout-smoke.ts` 手动探针。全量 429 测试绿。
- **本地闭环实跑（2026-10-31）**：本地库已有 1 个目标 / 1 个激活计划 / 229 个节点 / 157 个会话；10-31 提交过一次检查（0.16），掌握度写回并在 2026-11-01 安排了复习；lesson enrichment 在 10-28、10-29、10-31 各成功一次。也就是说「计划 → 今天 → 细化 → 检查 → 掌握度 → 复习」已经真实跑通，剩下的是 Scout 与提醒渠道。
- **搜索配置独立（2026-11-01）**：新增 `provider_configs.slot = "web_search"`（provider 固定 `deepseek`）、
  `GET/PUT /config/provider/web-search`、设置页「模型与记忆 › 联网搜索」卡片。
  `resolveWebProvider` 优先读这个槽位，槽位存在但停用/缺 key 时显式返回 `null`；
  未配置槽位的老 profile 才回退到「推理 provider 是 DeepSeek」。
  原因：搜索与推理是两笔账单、两个用途，OpenCode Go 不代理 `/v1/tools/*`。
- **Telegram 发送修复（2026-11-02）**：测试提醒报
  `telegram: ECONNRESET` 是因为本机只配了 SOCKS 形态的 `all_proxy`
  （`socks5h://127.0.0.1:10808`），而 Bun 的 fetch 只认 HTTP(S) proxy。
  新增 `NEOBUNI_TELEGRAM_PROXY_URL`（只作用于 Telegram API，避免把模型请求
  也塞进代理），本地 `.env` 已指向 `http://127.0.0.1:10808`。
- **教材库重建（2026-11-02）**：本地库的教材 chunks / embeddings 丢失，导致
  `/enrich` 返回 `material: null`。重新入库 682 chunks，新增
  `apps/server/scripts/embed-knowledge.ts` 回填 682 条 embedding；
  `ingest-textbook.ts` 增加 busy timeout 与半写入文档清理；`/enrich` 响应新增
  `materialStatus`，Web 端在 `no_sources` / `failed` 时给出 toast。
- **Web 依赖修复（2026-11-03）**：`apps/web` 的 `recharts` 已写在
  `package.json` 和 `bun.lock`，但 `node_modules` 里没有安装（之前一次
  install 不完整）。执行 `bun install --frozen-lockfile` 后补齐，
  `apps/web` build + `tsc --noEmit` 通过。

## Next Exact Step

1. **重启 dev server，验证聊天侧两条链路**：
   - 问「教材里计算机组成对应哪几章」，确认调用 `search_knowledge` 并引用
     `第2章 p.X`；问「你能读哪些资料」，确认调用 `list_knowledge`。
   - 调用一次 `search_web` / `fetch_page` / `summarize_page`，确认 provider 为
     `deepseek`，不再出现 Webclaw key 报错。
2. **重试「发送测试提醒」**：`NEOBUNI_TELEGRAM_PROXY_URL`
   只在进程启动时读取，重启后才会生效。本机的 `socks5h://127.0.0.1:10808`
   同时接受 HTTP CONNECT，所以值用 `http://127.0.0.1:10808`。
3. **跑一次 Scout 手动探针**（`web_search` 槽位已配置 DeepSeek）：

   ```bash
   DATABASE_URL="file:$PWD/.data/local.db" bun run apps/server/scripts/study-scout-smoke.ts
   ```

   期望 `available:true`、`queryCount>0`、`picks` 2–3 条带 `why`。
4. **Telegram 四个按钮各点一次**：收藏 / 出题 / 不感兴趣 / 明晚再看，
   确认 `study.scout_saved` / `study.scout_quiz` /
   `study.scout_feedback{action:"skip"|"later"}` 事件写入、重复点击幂等、
   7 天内不再出现同一条。
5. **今天有到期复习**：`study_mastery.next_review_at = 2026-11-01`（10-31 那次 0.16 的检查）。
   用聊天里的「考考我」走一遍 `study_quiz` → `study_quiz_submit`，确认 3 题判分、
   掌握度更新、session 完成、下一次复习被排期。
6. **看一眼 REST 文档**：server 已在 `:3000` 运行，打开
   `http://localhost:3000/api-reference`（spec 在 `/api-reference/spec.json`）。
   顺带决定 `/api-reference` 是否只做文档挂载点、把 operation 挪回 API 根路径。
6. 跑 `bun run test`，保持全绿。

## Reopen These Files

- `docs/workbench/now.md`
- `docs/workbench/features/initiative-study-journey.md`
- `docs/workbench/features/openapi-rest-rollout.md`
- `docs/workbench/features/study-scout.md`
- `apps/fumadocs/content/docs/buni/study/study-scout.md`
- `apps/server/scripts/study-scout-smoke.ts`
- `experiments/decision-os/README.md`
- `apps/server/src/routes/api.openapi.test.ts`
- `apps/server/src/memory/knowledge-store.ts`
- `apps/server/src/memory/knowledge-locator.ts`
- `apps/server/src/tools/search-knowledge.ts`
- `apps/server/src/tools/list-knowledge.ts`
- `apps/server/src/integrations/web/provider.ts`
- `apps/server/src/integrations/web/dispatch.ts`
- `packages/contracts/src/execution-layer/knowledge-tools.ts`
- `packages/core/src/cognition/retrieval-signals.ts`
- `packages/contracts/src/decision/index.ts`
- `packages/core/src/decision/next-action.ts`
- `apps/server/src/decision/initiative-worker.ts`
- `apps/server/src/decision/next-action-evaluation-service.ts`
- `apps/web/src/routes/_app/now/index.tsx`
- `packages/core/src/cognition/retrieval-signals.ts`
- `apps/server/src/memory/knowledge-store.ts`
- `apps/server/src/tools/tool-sets.ts`
- `apps/server/src/tools/search-web.ts`
- `apps/server/src/integrations/web/provider.ts`

## Open Questions

- 考纲来源是否就用自编主题表 + 用户上传官方大纲？
- 论文判分 v1 是否接受"仅 rubric + LLM"，不做人工校准？
