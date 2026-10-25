---
title: "Current Focus"
---

# Current Focus

Updated At: 2026-10-25 18:00 Asia/Shanghai
Active Feature: initiative-study-journey
Status: design-draft

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
- **端到端集成测试（2026-10-25）**：真实 DB 上跑通创建目标 → 生成/排期 → 读取今天 → 提交检查 → 掌握度 → 次日复习；全量 290 个测试绿。

## Next Exact Step

1. **真实环境试跑**：在 Now 创建学习目标，完成一节检查，配置一个提醒渠道，观察 `study.reminder_sent` 事件与推送。
2. **P3-3 LLM 增强（可选）**：用 reasoning provider 改写 lesson 的 what/how 与检查题，严格 Zod 校验，失败回退到确定性版本。
3. **收尾**：把 `experiments/decision-os/` 与旧 docs 的归档说明补齐；给 Study 相关接口补 OpenAPI 描述。
4. 跑 `bun run test`，保持 290+ 全绿。

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
