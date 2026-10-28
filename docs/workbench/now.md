---
title: "Current Focus"
---

# Current Focus

Updated At: 2026-10-25 23:20 Asia/Shanghai
Active Feature: opencode-go-provider (implemented) / initiative-study-journey (smoke run)
Status: awaiting-live-smoke

## Why

Port（buni → neobuni）已经完成并且健康：90 个测试文件 / 277 个测试全绿、typecheck 与 Ultracite 通过、`/` 健康检查正常。
但本地库只有 5 次对话、0 条记忆、0 个目标、0 个日程，说明产品价值还没有被真正跑通。

下一阶段的重点是 **Initiative**：让 Buni 围绕用户目标持续地计划、提醒、教学、检验并量化进展。
第一个垂直场景改为 **Study Journey（软考 · 系统架构设计师）**，用一条完整学习闭环倒逼 Decision OS 精简。

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
- **OpenCode provider 联调（2026-10-25）**：真实试跑发现三个问题并修复——① Go 有独立端点命名空间 `/inference/go/...`，指向 Console 路径会 402；② `enrichStudyLesson` 把"没有 provider"和"provider 调用失败"都返回 null，掩盖了真实错误，现在分为 `missing_provider` / `provider_error` 并在 API 层返回 `BAD_GATEWAY` 携带真实信息；③ 推理模型的 `reasoning_content` 计入 `max_tokens`，冗长 prompt 导致 JSON 截断，现在 prompt 有明确字数上限、`maxTokens` 提到 3000、并对拒绝 temperature 的模型（如 kimi-k2.7-code）自动重试。实测：细化 11.3s 成功、判分 4.3s（LLM 0.85 分）。默认模型改为 `deepseek-v4.1-flash`。全量 314 个测试绿。
- **OpenCode provider（2026-10-25）**：新增 `opencode` vendor（OpenAI 协议、Base URL `https://opencode.ai/inference/openai/v1`）、`glm-5.3-flash` 默认模型、模型目录拉取（`config.providerModels`）、`User-Agent` / `x-opencode-session` 头、study 侧稳定 session id；无迁移。全量 310 个测试绿，typecheck 与 Ultracite 通过。

## Next Exact Step

1. **重启 dev server 后重试「用 AI 细化这节课」**：provider 已配好（OpenCode / `deepseek-v4.1-flash` / Go 端点），
   本地库里的 `base_url` 已修正为 `https://opencode.ai/inference/go/openai/v1`。
   细节与实测数据见 `docs/workbench/features/opencode-go-provider.md`。
2. **真实环境试跑**：细化一节课 → 完成检查 → 配置提醒渠道 → 观察 `study.reminder_sent` 事件与推送。
3. **收尾**：给 Study 相关接口补 OpenAPI 描述；把 `experiments/decision-os/` 与旧 docs 的归档说明补齐。
4. **可选**：把"考考我"做成聊天里的持久化检查工具（复用 `gradeStudyChecks`）。
5. 跑 `bun run test`，保持 310+ 全绿。

## Reopen These Files

- `docs/workbench/now.md`
- `docs/workbench/features/initiative-study-journey.md`
- `experiments/decision-os/README.md`
- `packages/contracts/src/decision/index.ts`
- `packages/core/src/decision/next-action.ts`
- `apps/server/src/decision/initiative-worker.ts`
- `apps/server/src/decision/next-action-evaluation-service.ts`
- `apps/web/src/routes/_app/now/index.tsx`

## Open Questions

- 考纲来源是否就用自编主题表 + 用户上传官方大纲？
- 论文判分 v1 是否接受"仅 rubric + LLM"，不做人工校准？
