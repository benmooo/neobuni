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

## Next Exact Step

1. 开始 **P3（计划生成）**：先写 `study-templates/system-architect-2026.json` 自编考纲主题表（模块 + 权重 + 科目归属 + syllabusRef），再加分层展开与校验。
2. 计划生成先走"模板 → 确定性展开 → 校验"的离线路径，LLM 只负责把模块扩成小步 lesson；所有产物必须通过 `validateStudyPlan`。
3. 跑 `bun run test`，保持 258+ 全绿。

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
