---
title: "Initiative · Study Journey（软考系统架构设计师）"
---

# Initiative · Study Journey（软考系统架构设计师）

> Status: design draft, awaiting scope approval
> Date: 2026-10-25
> Supersedes: generic "software-project goal" first slice (DRI 2026-10-22)
> Related: `docs/workbench/now.md`, `apps/fumadocs/content/docs/buni/decision-os/`

## 0. 一句话

**Initiative** 是最高层产品能力：Buni 围绕用户的目标和意图，持续地计划、提醒、教学、检验、量化，并主动推进。
**Study Journey** 是 Initiative 的第一个垂直场景：帮用户通过「软考 · 系统架构设计师」。
**Decision OS** 不再是独立的"决策操作系统"，而是 Initiative 内部一个很薄的、确定性的"下一步做什么"引擎。

目标不是"再加一个功能"，而是把现有 Decision OS 从"决策研究平台"收敛成"能每天真正推着用户走一步的学习教练"。

## 1. Why

现有 Decision OS 已经能记录目标、承诺、候选、决策轨迹和反馈，但它解决的是"如何安全地做主动决策"，而不是"用户今天到底该学什么"。
结果是：

- 主动性停留在 Now 页面的一条建议，用户没有下一步的具体动作；
- 没有计划、没有教学、没有检验，无法形成"学会"的闭环；
- Jev / shadow / release gate / evaluation replay 占了大量运行时与心智成本，但和第一个真实场景无关；
- 本地库里 5 次对话、0 条记忆、0 个目标、0 个日程，说明产品价值还没有被真正跑通。

Study Journey 用一条完整闭环来倒逼简化：**计划 → 今天这一步 → 学 → 测 → 掌握度 → 进度 → 主动推下一次**。

## 2. 产品边界（v1）

### 2.1 用户故事与六条需求

| # | 需求 | v1 行为 |
|---|---|---|
| 1 | 帮我们计划和安排学习 | 输入考试、目标日期、每天可用时间，生成覆盖全部考纲的分阶段计划，并落到每一天的 30–45 分钟学习会话 |
| 2 | 指导学什么、怎么学 | 每个学习节点都有：目标、知识点、学习方式（读/画/对比/复述/真题）、资源、预计时长 |
| 3 | 能考我们、验证是否真的掌握 | 每节课后 3 题：回忆题 + 应用题 + 迁移题；客观题确定性判分，主观题按 rubric 判分并给出漏点 |
| 4 | 量化并可视化到目标的旅程 | 覆盖率、掌握度、三科就绪度、节奏预测、连续天数；以时间轴 + 热力图 + 三科仪表盘呈现 |
| 5 | 主动推着我们学 | 到点推送"今天学什么 + 怎么学 + 多久"；漏学后提出最小改动的重排；考前切换模考/弱项模式 |
| 6 | 步子小、但覆盖全面 | 单节课 ≤ 45 分钟、1 个可验证目标、1 次检查；用考纲覆盖矩阵保证"小步"不等于"漏学" |

### 2.2 非目标（v1 明确不做）

- 不做通用课程市场、不做多人协作、不做老师端；
- 不做"全自动替你学习"：Buni 负责计划、讲解、出题、判分、催促，学习动作仍由用户完成；
- 不做多考试类型抽象：先把「系统架构设计师」打通，模板化后再抽通用；
- 不做实时语音/视频课；
- 不把 Jev 重新引回学习路径（v1 全部走确定性规则 + 普通 LLM 生成/判分）。

### 2.3 考试事实（作为默认模板参数）

- 三个科目，每科满分 75，合格线 45，三科需同次全部通过：
  - 综合知识：75 道选择题；
  - 案例分析：问答题（必答 + 选答）；
  - 论文：4 选 1，限时写作。
- 每年 5 月、11 月开考（以官方当期通知为准）。
- 默认目标：**2027 年 5 月**，每天 90 分钟、每周 6 天、周日复盘。
- 这些全部是 `domainConfig` 配置，不写死在代码里。

## 3. 领域模型

原则：**Goal 是意图；Plan 是路线；Session 是今天的一步；Check 是证据；Mastery 是结论；Progress 是视图。**

### 3.1 Goal 扩展

> **实现偏差（2026-10-25）**：学习配置没有直接改 `goals` 表，而是放在 1:1 的
> `study_goal_configs`（`goalId` 为主键）。这样 Goal 保持通用，学习域可以独立
> 迭代和删除，不需要给所有现有 Goal 读写路径加 `kind` 分支。

在现有 `goals` 上增加：

| 字段 | 类型 | 说明 |
|---|---|---|
| `kind` | `"generic" \| "study_exam"` | 默认 `generic`，学习目标为 `study_exam` |
| `targetAt` | `string \| null` | 目标日期（考试日） |
| `domainConfigJson` | `object` | 考试与学习偏好 |

`study_exam` 的 `domainConfig`：

```ts
{
  exam: "系统架构设计师",
  level: "senior",
  papers: ["comprehensive", "case", "essay"],
  dailyMinutes: 90,
  studyWindow: { start: "20:00", end: "22:30" },
  restDays: [0],                 // 0=周日
  timezone: "Asia/Shanghai",
  quietHours: { start: "23:30", end: "07:30" },
  channels: [{ platform: "telegram", targetAlias: "me" }],
  syllabusTemplateId: "system-architect-2026",
  planStyle: { maxLessonMinutes: 45, reviewRatio: 0.35 }
}
```

### 3.2 计划树（小步 + 全覆盖）

`study_plans`（版本化，可重排）→ `study_plan_nodes`（树）：

- `phase`：阶段（基础 / 架构核心 / 案例 / 论文 / 冲刺）
- `module`：科目或知识域
- `topic`：考纲主题
- `lesson`：**唯一可执行单元**

每个 `lesson` 必须包含：

| 字段 | 约束 |
|---|---|
| `objective` | 一句可验证的目标（"能画出…并解释…"） |
| `whatText` | 学什么（最多 3 个新概念） |
| `howText` | 怎么学（具体动作：读哪节、画什么图、做哪类题、如何复述） |
| `resourcesJson` | 教材章节、真题年份、外部链接（可为空） |
| `estimatedMinutes` | 20–45 |
| `paper` | `comprehensive` / `case` / `essay` / `shared` |
| `weight` | 考纲权重 0–1 |
| `syllabusRefs` | 对应考纲节点 id，用于覆盖校验 |
| `prerequisites` | 前置 lesson id，必须无环 |
| `checkSpec` | 3 题检查的规格（回忆/应用/迁移） |

**小步规则（硬约束，生成后校验）**

1. 一节课只教一个新能力，最多 3 个新概念；
2. 一节课只对应一个 `objective`，且能用一次检查验证；
3. 预计时长 ≤ 45 分钟；
4. 必须有 `howText`，且是可执行动作而非"理解/熟悉"；
5. 必须有 3 道检查题，其中至少 1 道应用题。

**全面性规则（硬约束）**

1. 考纲每个叶子节点至少被 1 个 lesson 覆盖；
2. 三科权重之和覆盖 100%，不允许"只刷选择题"；
3. 论文科目必须有：素材库、提纲训练、限时全文，各至少 3 次；
4. 考前 14 天必须包含至少 3 次整卷模考；
5. 计划总时长 ≤ 可用天数 × 每日分钟数；放不下时**不静默删减**，而是给出三选一：延后目标、增加每日时长、降低低权重主题深度。

### 3.3 学习会话

`study_sessions`：

| 字段 | 说明 |
|---|---|
| `goalId` / `planNodeId` | 归属 |
| `scheduledFor` | 具体到日期 + 时段 |
| `durationMinutes` | 计划时长 |
| `status` | `planned / in_progress / completed / skipped / missed` |
| `startedAt` / `completedAt` / `actualMinutes` | 真实执行 |
| `rescheduledFrom` | 重排来源，保证可追溯 |

一节课的默认结构（30–45 分钟）：

```
5 min  回顾上次（间隔复习）
10 min 学新内容（读/看/画）
10 min 主动回忆 + 应用（不看资料）
5 min  3 题检查
5 min  整理成卡片 / 记录薄弱点
```

### 3.4 检查与掌握度

`study_checks`：

- `kind`: `recall | mcq | case | essay | mock`
- 客观题：确定性判分；
- 主观题：LLM + rubric 判分，输出 `score`、`missingPoints`、`nextAction`；
- 每节课 3 题：回忆（是什么）、应用（怎么用）、迁移（换个场景）；
- 通过线：3 题中至少 2 题达标。

`study_mastery` 按 lesson 维护：

```
new = clamp(old + α * (score - old), 0, 1)
α = 0.4（首次）/ 0.25（复习）
confidence = min(1, attempts / 3)
```

复习间隔阶梯（按最近一次得分）：

| 得分 | 下次复习 |
|---|---|
| < 0.6 | 次日重学 + 3 天后再测 |
| 0.6–0.8 | 3 天 |
| 0.8–0.9 | 7 天 |
| ≥ 0.9 | 14 天 → 30 天 |

### 3.5 进度与就绪度

全部是**派生读模型**，不额外存冗余统计。

- **覆盖率** = 已完成 lesson 权重 / 总权重
- **掌握度** = Σ(lesson 权重 × mastery) / Σ(权重)，逾期未复习的 mastery 按天数衰减
- **三科就绪度**（换算到 75 分制）：

```
readiness(paper) = 0.55 * mastery(paper)
                 + 0.30 * recentMockScore(paper)
                 + 0.15 * coverage(paper)
```

- **总体就绪度 = min(三科就绪度)**，因为三科必须同时过线；不用平均值掩盖短板。
- **节奏预测**：按最近 14 天完成速度，预测考试日覆盖率；低于 95% 时给出"每天需增加 X 分钟"或"目标日期需后移 Y 天"。
- **可视化**：时间轴（阶段里程碑）、三科仪表盘（45 分线）、模块掌握度热力图、7 天前瞻、连续学习天数。

## 4. 核心循环

### 4.1 计划生成（一次，可重排）

```
考纲模板 / 用户上传大纲
   ↓ 结构化抽取（LLM，严格 Zod schema）
考纲树（节点 + 权重 + 科目归属）
   ↓ 确定性展开规则（小步规则）
lesson 草稿
   ↓ 校验器
覆盖校验 + 时长校验 + 粒度校验 + 前置无环 + 检查题齐全
   ↓ 人工确认（可编辑）
active plan v1
```

实现要点：

- 默认使用仓库内**自编考纲主题表** `packages/core/src/study/templates/system-architect-2026.json`（11 模块 / 62 主题 / 约 6300 分钟），不提交官方教材原文（版权）；
- 模板权重与科目归属由 `template.test.ts` 校验：模块权重和为 1、每个模块内主题权重和为 1、topic id 唯一；
- 用户可把官方大纲 PDF 放进知识库，生成时作为参考；
- 计划生成是长任务：`study_plan_jobs`（queued/running/succeeded/failed），由 worker 消费，前端轮询；
- 重新生成时保留已完成 lesson 与 mastery，只重排未完成部分，`version + 1`。

### 4.2 每日调度（确定性，无 LLM）

输入：可用时间、学习窗口、休息日、lesson 时长、到期复习、前置关系。
输出：未来 N 天的 `study_sessions`。

规则：

1. 先排到期复习，最多占当天预算 40%；
2. 再排 1 个新 lesson；
3. 每周第 7 天只做复习/周测；
4. 考前 14 天切模考 + 弱项；
5. 漏学：顺延到下一个可用时段，最多连续顺延 2 天；积压 > 3 节时生成"重排建议"，不自动打乱整张计划。

### 4.3 学习 → 检查 → 复习

```
Session due
  → 用户点"开始"（或聊天里说"开始今天的学习"）
  → 展示 what / how / 计时
  → 完成学习，进入 3 题检查
  → 判分
      ├─ 通过：mastery ↑，安排间隔复习，session completed
      └─ 未通过：标记薄弱点，次日安排 10 分钟重学 + 重测
  → 更新 progress / readiness
```

### 4.4 主动推送

由 initiative worker 每 15 分钟扫一次（不是每个用户一个 cron）：

| 触发 | 动作 |
|---|---|
| 今日 session 在 60 分钟内开始且未提醒 | 推送"今天学什么 + 怎么学 + 预计多久" |
| session 逾期 24h | 推送"最小改动的重排建议"（今天晚 30 分钟 / 明天补） |
| 检查未通过 | 次日推送重学 + 重测 |
| 进度落后预测线 | 推送"每天 +X 分钟"或"目标后移 Y 天"三选一 |
| 考前 14 天 | 切换模考/弱项模式 |
| 用户连续 3 天完成 | 轻量正向反馈，不刷屏 |

约束：

- 默认最多 2 条/天；静默时段不推；
- `autonomyMode = observe`：只进 Now，不外部推送；
- `collaborate`：推送 + 一键开始/稍后/今天跳过；
- `execute_reversible`：可自动重排 session，但"开始学习"仍需用户确认；
- 推送文案确定性渲染，**不走 headless agent turn**（省 token、可测、不会幻觉）；
- 幂等键：`goalId + sessionId + kind + localDate`，同一 session 同一渠道只推一次。

## 5. Decision OS 精简

### 5.1 保留

| 能力 | 去留 | 原因 |
|---|---|---|
| Goal / Commitment | 保留 | 意图与用户承诺仍是控制面 |
| Decision trace（一条建议一行） | 保留但瘦身 | 用户要能问"为什么现在让我学这个" |
| Feedback（接受/忽略/推迟） | 保留 | 调整推送与计划 |
| Initiative worker | 保留并改造 | 主动性的调度器 |
| Autonomy mode | 保留 | 控制打扰强度与自动重排边界 |

### 5.2 降级或移出运行时

| 能力 | 处理 |
|---|---|
| Jev provider / `decision_judgments` / provider 配置 UI | 移出学习路径；代码归档到 `experiments/` 或删除，运行时不再依赖 |
| `next-action-shadow` / `retrieval-shadow` / `evidence-relevance-shadow` | 删除或归档，不参与生产决策 |
| `release-gate` / `evaluation-fixtures` / `evaluation-replay` | 移出运行时；保留文档作为历史 |
| `decision_questions/answers` 契约 | 仅保留给实验，生产不使用 |
| Telegram 草稿 + action-run 通用执行链 | 保留为独立"外发适配器"，不进入学习主路径；Now 首屏移除 |
| 决策健康面板 | 从 Now 移到 Ops/设置 |

### 5.3 新的决策形状

```ts
type InitiativeDecision = {
  id: string;
  profileId: string;
  goalId: string | null;
  kind:
    | "study.session_due"
    | "study.session_missed"
    | "study.review_due"
    | "study.replan"
    | "study.mock_due";
  route: "suggest" | "execute" | "skip"; // execute 仅限内部可逆动作
  reason: string;                        // 一句话解释，给用户看
  evidence: Record<string, unknown>;     // sessionId / mastery / pace
  candidate: {
    id: string;
    title: string;                       // "今天 20:00 学：质量属性与 ATAM"
    what: string;
    how: string;
    estimatedMinutes: number;
  } | null;
  stateFingerprint: string;              // 幂等
  createdAt: string;
};
```

`route` 从 6 个值收敛到 3 个；`policyVersion` 保留用于审计，但不再有 shadow/jev reason。

## 6. API

新增 `study` 命名空间（server-only extras 或独立 router）：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/study/plan/generate` | 创建生成任务，返回 jobId |
| GET | `/study/plan/jobs/:jobId` | 轮询生成状态 |
| GET | `/study/goals/:goalId/plan` | 计划树 + 版本 |
| POST | `/study/goals/:goalId/plan/activate` | 确认并激活 |
| POST | `/study/goals/:goalId/replan` | 保留已完成，重排剩余 |
| GET | `/study/goals/:goalId/today` | 今天 + 未来 7 天 |
| POST | `/study/sessions/:sessionId/start` | 开始 |
| POST | `/study/sessions/:sessionId/complete` | 完成（实际分钟） |
| POST | `/study/sessions/:sessionId/skip` | 跳过 |
| POST | `/study/sessions/:sessionId/reschedule` | 重排 |
| POST | `/study/sessions/:sessionId/check` | 提交 3 题答案并判分 |
| GET | `/study/goals/:goalId/progress` | 覆盖率/掌握度/就绪度/预测 |
| POST | `/study/goals/:goalId/mock` | 生成一次模考 |

聊天工具（薄封装，复用同一 service）：

- `study_today`：今天学什么、怎么学、多久
- `study_check`：考我 / 提交答案 / 判分
- `study_progress`：我学得怎么样、哪里最弱
- `study_reschedule`：今天没空，帮我挪一下

Goal 创建扩展：`goals.create({ kind: "study_exam", targetAt, domainConfig, ... })`。

## 7. UI

### 7.1 Now（首屏 = 学习驾驶舱）

从现在的"Telegram 草稿 + 决策健康"改成：

1. **今天这一步**（唯一主卡片）：标题、what、how、预计时长、开始按钮；
2. **考试倒计时 + 总体就绪度 + 三科仪表盘**（45 分线，取 min）；
3. **7 天前瞻**：每天一个点，今天高亮；
4. **最弱的 3 个主题**：点击直接重学/重测；
5. **节奏提示**：按当前速度，考试日预计覆盖 X%；"每天 +12 分钟"按钮。

### 7.2 Goal 详情页 `/study/$goalId`

- 阶段时间轴（基础 → 架构核心 → 案例 → 论文 → 冲刺）；
- 计划树（可展开到 lesson，显示掌握度热力）；
- 学习记录（session 历史、实际用时）；
- 重排入口；
- 任务/承诺与学习 session 的关系（只读）。

### 7.3 Chat

- 助手消息里嵌入"今日学习卡"（开始 / 稍后 / 换一节）；
- 检查以对话形式进行，但底层仍是结构化 `study_checks`，保证可判分、可回看；
- 支持"考考我"即兴抽题（不改变计划）。

### 7.4 Settings > Study

每天可用分钟、学习时段、休息日、提醒渠道、静默时段、目标日期、计划风格（小步上限）、重置/重排。

## 8. 重构阶段与验收

| 阶段 | 内容 | 验收 |
|---|---|---|
| P0 | 本设计 + 范围确认（删除 vs 归档 Jev、是否保留 Telegram 试点） | 决策记录写入本文件 |
| P1 | Decision OS 瘦身：契约收敛、Jev/shadow/gates 移出运行时、Now 去掉无关卡片 | ✅ done（2026-10-25）：Jev/shadow/gates 已归档到 `experiments/decision-os/`；`decisionEvaluation`、Jev provider 设置、Now 的 Telegram 草稿与决策健康面板已移除；`bun run check-types`、`bun run test`、Ultracite 全绿 |
| P2 | Study 领域：schema + 纯 core（planner/scheduler/mastery）+ 单测 | ✅ done（2026-10-25）：`study_*` 契约、6 张表 + 迁移、`packages/core/src/study`（校验/排期/掌握度/进度），新增 20 个单测，全量 258 个测试绿 |
| P3 | 计划生成：模板 + 结构化抽取 + 校验器 + job | 🟡 in progress：模板 v0 + 确定性展开（150 个左右小课）+ 持久化 + API 已完成；LLM lesson 内容生成与异步 job 待做 |
| P4 | 会话/检查/进度 API + repo 集成测试 | ✅ backend done（2026-10-25）：today / progress / session / check 判分 / mastery 写回 / 未通过次日复习；repo 集成测试与 router 测试通过 |
| P5 | Now 驾驶舱 + Goal 详情 + 设置 | 🟡 in progress：Now 已接学习驾驶舱（一步开始、今天这一步、完成并检查、三科就绪度、未来安排）；学习详情页与 Settings 待做 |
| P6 | 主动推送 + 聊天工具 | 到点只推一次；漏学给出最小重排；静默时段不推 |
| P7 | 端到端种子 + 验收 | 用 mock provider 跑通 7 天学习循环；真实 provider 手动 smoke |

预计 3–4 周（单人）。

### 8.1 垂直切片验收清单

- [ ] 创建「系统架构设计师」目标（2027-05），输入每天 90 分钟；
- [ ] 生成计划：三科全覆盖，lesson ≤ 45 分钟，含 3 题检查；
- [ ] 今天卡片给出 what / how / 时长；
- [ ] 完成后 3 题检查，客观题确定性判分，主观题 rubric 判分；
- [ ] 未通过自动安排次日重学；
- [ ] 进度页显示覆盖率、三科就绪度（min）、节奏预测；
- [ ] 到点推送一次，重复 tick 不重复推送；
- [ ] 漏学一天，给出"今晚 +30 分钟 / 明天补 / 顺延"三选一；
- [ ] 聊天里问"今天学什么 / 考考我 / 我学得怎样"都能回答；
- [ ] 所有确定性规则在 `packages/core` 有单测，provider 用 mock 可跑 E2E。

## 9. 决策记录

已确认（2026-10-25）：

1. **目标日期与每日预算**：默认 2027-05、90 分钟/天、6 天/周、周日复盘；全部可配置。
2. **Jev / shadow / gate 代码**：归档到 `experiments/decision-os/`，不编译、不进 CI；运行时已解耦。
3. **提醒交付**：学习提醒走独立的确定性模板推送，不复用 `schedules → task-run → headless turn` 链路。
4. **Telegram action-run 试点**：API 与执行链保留为独立外发适配器，但已移出 Now 首屏，不进入学习主路径。
5. **学习 session 与日程**：v1 独立建模，不并入 `schedules`；后续需要日历视图时再做投影。
6. **掌握度模型**：先用 EMA + 间隔复习阶梯；数据足够后再评估 IRT/贝叶斯。
7. **命名层级**：Initiative 是产品能力，Study Journey 是第一个垂直场景，Decision OS 只是内部的下一步决策引擎。

仍待确认（不阻塞 P2）：

- **考纲来源**：默认自编主题表 + 用户可上传官方大纲；仓库不提交官方教材原文。
- **论文判分**：v1 仅 rubric + LLM 评分，不做人工校准；用抽样一致性检查兜底。

## 10. 风险

| 风险 | 缓解 |
|---|---|
| 计划生成"看起来很全"但不可执行 | 硬校验：覆盖矩阵 + 时长预算 + 粒度规则 + 人工确认 |
| LLM 判分不稳定 | 客观题确定性判分；主观题固定 rubric + 温度 0 + 记录判分理由；至少 2 次抽样一致性检查 |
| 主动推送变成骚扰 | 每天上限、静默时段、observe 模式只进 Now、一键暂停 |
| 计划赶不上变化 | 只重排未完成部分；积压 > 3 节才触发整体重排；版本化保留历史 |
| 简化误删未来要用的能力 | 先归档不删除；运行时解耦后再决定物理删除 |
| 考纲/教材版权 | 仓库只存自编主题表与题目索引，不提交官方原文 |
