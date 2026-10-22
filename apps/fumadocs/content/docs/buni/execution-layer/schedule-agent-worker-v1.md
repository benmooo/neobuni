---
title: "Buni Schedule-Triggered Autonomous Agent Worker V1"
---

# Buni Schedule-Triggered Autonomous Agent Worker V1

> 状态: target architecture
> 日期: 2026-06-01
> 目标: 以激进迁移方式，把现有 `schedule -> due runner -> direct delivery` 形态一次性切换为 `schedule blueprint -> task_run -> autonomous agent worker`

## 0. 文档目的

本文定义 Buni 的下一代定时执行架构：

- `schedule` 只表示任务蓝图
- 每次触发都会派生出一个 `task_run`
- 后台 worker claim `task_run`
- worker 启动一个脱离当前 chat request 的 headless agent runtime
- agent 在运行时基于 prompt 和工具集合自主规划、调用工具、完成任务

本文是一次性迁移方案，不保留旧的 schedule 直接执行模型。

## 1. 现状与问题

当前已实现的 schedule 运行链路是：

```text
tool / route 创建 schedules row
  -> due runner 定期扫 schedules
  -> deliverDueSchedule() 直接执行副作用
  -> 成功后把 recurring schedule 的 triggerAt 推到下一次
```

这套实现的问题不是“能不能工作”，而是对象模型本身错误：

1. `schedule` 同时承担了 blueprint、队列项、执行状态三种职责。
2. 执行逻辑写死在 `delivery.ts`，而不是 runtime agent 自主决策。
3. `metadata.kind === "news_brief_monitor"` 这类分支让 scheduler 知道业务细节。
4. schedule 的“执行”不是一个独立实体，无法干净地表达 claim、lease、heartbeat、retry、result。
5. 现有 chat runtime 绑定到 request/SSE 生命周期，不适合 detached worker。
6. `runtime_turns.conversationId` 当前要求非空，不适合无前台会话的后台执行。

所以当前模型不是真正的 task/job runner，更不是 schedule-triggered autonomous agent worker。

## 2. 目标

本次迁移的明确目标是：

1. 只保留一种调度执行模型：`schedule-triggered autonomous agent worker`
2. `schedule` 变成 blueprint，不再直接承载执行
3. 引入 `task_runs` 作为唯一的具体执行实例
4. 新增 schedule 管理工具，让 Buni 可通过对话自行创建、查看、更新、暂停、恢复、取消 schedule
5. 删除所有 hard-coded 定时任务工具和 hard-coded schedule delivery branch
6. 保留 `cronExpr` 作为核心调度层唯一 recurrence 表达

## 3. 非目标

本版本暂不追求：

- 多进程分布式 worker 编排
- 复杂 DAG/workflow engine
- schedule catch-up replay 一次补跑所有错过窗口
- 任务结果自动回流到一个已经断开的旧 chat turn
- 为旧 schedule schema 提供向后兼容迁移层

这是早期项目，优先架构正确，不为旧形态保留额外兼容壳。

## 4. 设计原则

### 4.1 Functional Core, Imperative Shell

纯逻辑与副作用边界如下：

- 纯逻辑
  - cron 解析与下一触发点计算
  - schedule blueprint 校验与规划
  - task_run 状态机与 claim/retry 判定
  - tool allowlist / runtime policy 组装
- shell
  - DB 持久化
  - worker 循环
  - provider 调用
  - 工具调用
  - Feishu / news / GitHub 等外部集成

### 4.2 Schedule Is Blueprint, Task Run Is Truth

- `schedule` 只表达“未来应该反复产生什么任务”
- `task_run` 才表达“某个具体时间窗口里实际发生了什么”

### 4.3 Core Scheduling Keeps Only `cronExpr`

在核心调度层只允许：

- `cronExpr`
- `timezone`
- `nextTriggerAt`

如果上层需要 `daily | weekly | monthly` 这类 UX DSL，必须在进入持久化前编译为 `cronExpr`。

### 4.4 Scheduler Must Not Know Business Workflow

scheduler 不能知道：

- “news brief monitor”
- “reflection report”
- “GitHub trending”

scheduler 只负责：

- materialize due schedule
- 生成 `task_run`
- 驱动 agent worker 执行

业务流程应由 task prompt + runtime toolset 决定。

## 5. 目标对象模型

### 5.1 `schedules` 表语义

迁移后 `schedules` 表表示“任务蓝图”，建议字段语义如下：

- `id`
- `profileId`
- `title`
- `status`
  - `active | paused | cancelled`
- `timezone`
- `cronExpr`
  - nullable；`null` 表示 one-shot
- `nextTriggerAt`
  - 旧 `triggerAt` 字段应重命名语义为“下一个待 materialize 的触发点”
- `lastMaterializedAt`
  - 最近一次派生 `task_run` 的时间
- `blueprintJson`
  - 任务定义
- `createdAt`
- `updatedAt`

其中 `blueprintJson` 建议至少包含：

```ts
{
  version: 1,
  prompt: string,
  toolAllowlist?: string[] | null,
  maxSteps?: number | null,
  timeoutMs?: number | null,
  deliveryIntent?: {
    conversationId?: string | null,
    feishuTargetAlias?: string | null
  } | null,
  input?: Record<string, unknown> | null
}
```

说明：

- `title` 用于人类识别
- `prompt` 是运行时 agent 的主任务指令
- `input` 用于结构化参数快照，比如 `sourceId = github-trending-today`
- `toolAllowlist` 限制 worker 可见工具面，避免后台任务获得不必要能力

### 5.2 `task_runs` 表

新增 `task_runs` 表，作为具体执行实例：

- `id`
- `profileId`
- `scheduleId`
- `status`
  - `queued | claimed | running | succeeded | failed | retry_scheduled | cancelled`
- `scheduledFor`
  - 本次 run 对应的触发窗口
- `promptSnapshot`
  - 从 schedule blueprint 拷贝出来的本次运行 prompt
- `toolPolicySnapshotJson`
  - allowlist、timeout、maxSteps 等运行时策略快照
- `inputSnapshotJson`
  - 本次 run 使用的结构化输入快照
- `attempt`
- `maxAttempts`
- `leaseOwner`
- `leaseExpiresAt`
- `heartbeatAt`
- `runtimeTurnId`
- `resultJson`
- `errorJson`
- `createdAt`
- `startedAt`
- `finishedAt`
- `updatedAt`

`task_runs` 是唯一允许表达“执行进度”的地方。

## 6. Headless Runtime 语义

### 6.1 目标

worker 执行 `task_run` 时，需要一个不依赖前台 HTTP request 的 agent runtime：

```text
task_run claimed
  -> create headless runtime turn
  -> load profile/runtime context
  -> build toolset
  -> run model loop
  -> call tools
  -> persist result
```

这个 runtime 与现有 `createChatTurnStream()` 共享核心能力，但不共享 request/SSE 绑定。

### 6.2 建议抽象

应从当前 chat runtime 中抽出一个可复用的核心，例如：

- `runAgentTurn(...)`
  - 纯 server side
  - 不依赖 SSE
  - 返回完整结果对象
- `createChatTurnStream(...)`
  - 在上层包装 streaming / request abort / client tool 回传
- `runHeadlessTaskRun(...)`
  - 由 worker 调用
  - 使用 `runAgentTurn(...)`

### 6.3 Headless Turn 的输入

建议输入结构：

```ts
{
  profileId: string,
  executionSource: "task_run",
  taskRunId: string,
  conversationId?: string | null,
  userText: string,
  toolAllowlist?: string[] | null,
  timeoutMs?: number | null,
  maxSteps?: number | null,
  metadata?: Record<string, unknown>
}
```

这里的 `userText` 就是 schedule blueprint 里的 prompt 快照。

### 6.4 `runtime_turns` 的调整

当前 `runtime_turns.conversationId` 为非空，这不适合后台任务。

本次迁移建议直接调整为：

- `conversationId: nullable`
- 新增 `executionSource`
  - `chat | task_run`
- 新增 `taskRunId: nullable`

理由：

1. 后台任务不是用户对话 turn 的子集，不应伪造 conversation。
2. 若强行创建 synthetic conversation，会污染用户聊天空间。
3. observability 应该明确区分 chat turn 与 detached task run turn。

## 7. 运行时流程

### 7.1 Schedule 创建

来自 chat 的典型流程：

```text
用户: 每天早上八点获取最新的 GitHub trending repos 并发送到我的飞书
  -> agent 选择 schedule 管理工具
  -> 生成 cronExpr = "0 8 * * *"
  -> 生成 blueprint.prompt
  -> create_schedule(...)
  -> 持久化 schedule blueprint
```

这里不直接存“GitHub trending 结果”，只存“如何在运行时完成这件事”的任务蓝图。

### 7.2 Due Materialization

单独的 materializer 定期执行：

```text
scan active schedules where nextTriggerAt <= now
  -> 为每个 due schedule 派生一个 task_run
  -> 立刻把 schedule.nextTriggerAt 推进到下一个 future trigger
  -> one-shot schedule materialize 后可标记 completed 或 pending_finalization
```

关键决策：

**schedule 的 cursor 在 materialize 时推进，不在 task 成功后推进。**

原因：

1. `schedule` 是 blueprint cursor，不应该被具体 run 结果绑住。
2. `task_run` 失败或重试不应让 `schedule` 重新退化成 durable queue。
3. 这样可以避免同一窗口因 crash/重扫被反复从 schedule 再派生。

### 7.3 Worker Claim

worker 周期性 claim `task_runs`：

```text
select claimable task_runs
  -> set status = claimed
  -> write leaseOwner / leaseExpiresAt / heartbeatAt
  -> start execution
```

可 claim 条件：

- `status in ('queued', 'retry_scheduled')`
- `nextRetryAt is null or nextRetryAt <= now`
- `leaseExpiresAt is null or leaseExpiresAt <= now`

### 7.4 Worker Execute

worker 执行流程：

```text
task_run claimed
  -> set status = running
  -> create headless runtime turn
  -> run agent loop
  -> agent 自行决定调用哪些工具
  -> 写 result / error / runtimeTurnId
  -> set status = succeeded | failed | retry_scheduled
```

### 7.5 Heartbeat / Lease / Retry

建议规则：

- claim 时写 `leaseExpiresAt = now + leaseWindowMs`
- worker 每 `heartbeatMs` 续租
- 进程崩溃后，过租约自动可重领
- 重试次数超限后标记 `failed`

建议默认：

- `leaseWindowMs = 60_000`
- `heartbeatMs = 15_000`
- `maxAttempts = 3`

## 8. Agent Loop 责任划分

### 8.1 Blueprint 提供什么

schedule blueprint 只提供：

- 任务目标
- 时间语义
- 工具边界
- 交付意图

### 8.2 Agent 自主做什么

运行时 agent 自主决定：

- 先调哪个信息获取工具
- 是否需要多轮工具调用
- 如何整理中间结果
- 何时调用发送工具
- 如何处理空结果或异常分支

例如“每天早上八点获取 Hacker News top10 并发送飞书”的执行，应该是：

```text
agent 读取 prompt
  -> 决定调用 get_news_headlines(provider = hacker_news, sort = top, limit = 10)
  -> 汇总结果
  -> 调用 send_feishu_message
  -> 结束
```

而不是 scheduler 写死：

```ts
if (metadata.kind === "hacker_news_digest") {
  // ...
}
```

## 9. 工具面设计

### 9.1 原子执行工具

用于 task worker 的工具应该保持原子、通用：

- `get_news_headlines`
- `resolve_news_source`
- `search_news_sources`
- `send_feishu_message`
- 未来可增加：
  - `fetch_web_page`
  - `summarize_content`

这些工具负责“能力”，不负责“定时 workflow”。

### 9.2 Schedule 管理工具

新增对话可调用的 schedule 管理工具：

- `create_schedule`
- `list_schedules`
- `get_schedule`
- `update_schedule`
- `pause_schedule`
- `resume_schedule`
- `cancel_schedule`
- `delete_schedule`

其中：

- `create_schedule`
  - 直接写入 blueprint
- `update_schedule`
  - 可以改 `title / cronExpr / timezone / blueprint`
- `pause_schedule`
  - `status = paused`
- `resume_schedule`
  - 重新计算 `nextTriggerAt`
- `cancel_schedule`
  - 不再触发未来 run
- `delete_schedule`
  - 物理删除 blueprint；默认不删除历史 `task_runs`

### 9.3 为什么删除 `schedule_news_brief`

`schedule_news_brief` 属于错误抽象，因为它把：

- schedule 创建
- 新闻业务语义
- delivery 策略
- provider 绑定

耦合进了一个 composite tool。

正确模型里，这个需求应表达为：

1. 使用原子新闻工具完成一次即时任务
2. 或通过 `create_schedule` 持久化一个未来由 agent 执行的任务蓝图

因此 `schedule_news_brief` 应删除，而不是兼容保留。

## 10. Delivery 语义

迁移后不再需要 schedule 专属 `delivery.ts`。

“发送到 chat / 飞书” 不再是 scheduler 内建通道，而是普通工具调用。

这意味着：

- 是否发飞书，由 agent 决定并执行 `send_feishu_message`
- 是否回写某个 conversation，由 agent 决定并执行相应消息工具
- scheduler 不需要知道任何 delivery metadata

因此旧模型中的：

- `lastTriggeredAt`
- `deliveredAt`
- `metadata.delivery.*`

都不再是 schedule 主执行链路的核心状态。

这些状态如果保留，只能作为迁移过渡期字段；目标架构中应逐步移除。

## 11. One-shot 与 Recurring 语义

### 11.1 One-shot

- `cronExpr = null`
- `nextTriggerAt` 是单个绝对时间
- materialize 一次后：
  - 生成一个 `task_run`
  - schedule 进入 `completed` 或 `cancelled`

### 11.2 Recurring

- `cronExpr != null`
- `nextTriggerAt` 总是“下一个未来窗口”
- 每次 materialize：
  - 生成一个 `task_run`
  - 把 `nextTriggerAt` 推进到下一次 future trigger

不做 missed windows replay。恢复后只取下一个未来窗口。

## 12. 幂等与失败恢复

### 12.1 Materialization 幂等

需要一个唯一约束防止同一 schedule 同一窗口重复生成 run：

- unique `(scheduleId, scheduledFor)`

materializer 在事务内：

1. 检查 `schedule.nextTriggerAt <= now`
2. 插入 `task_run(scheduleId, scheduledFor = schedule.nextTriggerAt)`
3. 推进 `schedule.nextTriggerAt`

若唯一约束冲突，说明该窗口已 materialized，当前 sweep 可安全跳过。

### 12.2 Worker 幂等

worker 不负责去重 tool side effects。

tool 自身应以各自能力做幂等控制：

- Feishu send 可带外部幂等 key
- message create 可基于 taskRunId 去重
- 事件表可记录 `task_run.started / succeeded / failed`

### 12.3 失败策略

- provider 超时
- 工具失败
- 模型未完成任务
- 外部 API 失败

都应表现为 `task_run` 的失败，而不是 schedule 的结构性失败。

schedule blueprint 仍保留，未来窗口仍继续 materialize，除非用户暂停或取消。

## 13. 启动与进程内组件

V1 可以仍然采用单进程 server 内组件：

- `schedule materializer`
- `task run claimer`
- `task run worker`

启动时：

```text
index.ts
  -> startScheduleMaterializer()
  -> startTaskRunWorker()
```

但是职责必须拆开：

- materializer 只负责派生 run
- worker 只负责执行 run

不能再有一个 `due-runner + delivery` 把两件事混在一起。

## 14. 数据迁移策略

本次采用激进迁移，不保留双轨。

### 14.1 要删除的旧对象

- `apps/server/src/schedules/delivery.ts`
- `apps/server/src/tools/schedule-news-brief.ts`
- `packages/contracts/src/execution-layer/schedule-news-brief.ts`
- 所有 `metadata.kind === "news_brief_monitor"` 分支
- 所有 schedule-delivery 专用 metadata 状态机

### 14.2 要替换的旧语义

- `schedules.triggerAt`
  - 继续复用物理列也可以，但代码语义统一改为 `nextTriggerAt`
- `lastTriggeredAt / deliveredAt`
  - 从主执行链路移除
- `metadata.delivery`
  - 从主执行链路移除

### 14.3 现有 schedule 数据

因为项目尚未上线，可以接受：

- 直接重建本地数据库
- 或一次性转换旧 row 到新 blueprint 格式

优先选择最简单、最不歪曲目标架构的方案。

## 15. 代码组织建议

建议新增或重组模块：

```text
apps/server/src/schedules/
  blueprint.ts
  materialize.ts
  materializer.ts

apps/server/src/task-runs/
  claim.ts
  retry.ts
  worker.ts
  execute-task-run.ts
  types.ts

apps/server/src/runtime/
  run-agent-turn.ts
  run-headless-task-turn.ts
  create-chat-turn-stream.ts

apps/server/src/tools/
  create-schedule.ts
  get-schedule.ts
  update-schedule.ts
  pause-schedule.ts
  resume-schedule.ts
  cancel-schedule.ts
  delete-schedule.ts
```

`create-chat-turn-stream.ts` 不应继续承担唯一 runtime 入口。

## 16. 事件与可观测性

建议增加事件：

- `schedule.created`
- `schedule.updated`
- `schedule.paused`
- `schedule.resumed`
- `schedule.cancelled`
- `schedule.materialized`
- `task_run.queued`
- `task_run.claimed`
- `task_run.started`
- `task_run.succeeded`
- `task_run.failed`
- `task_run.retry_scheduled`

runtime timeline 中：

- chat turn 和 task run turn 都使用同一 observability 框架
- 但必须通过 `executionSource` 区分

## 17. 测试策略

至少覆盖：

1. schedule blueprint 创建与更新校验
2. recurring schedule 的 `cronExpr -> nextTriggerAt` 规划
3. materializer 为 due schedule 派生 `task_run`
4. 同一 `(scheduleId, scheduledFor)` 不重复 materialize
5. worker claim / heartbeat / lease 过期重领
6. headless agent runtime 能成功执行一条真实 task run
7. schedule CRUD tools 正常可用
8. 旧 `schedule_news_brief` 与旧 delivery branch 已彻底移除

## 18. 一个具体例子

用户说：

> 帮我创建一个任务：每天早上八点获取最新的 GitHub trending repos 并发送到我的飞书

目标流程：

```text
chat agent
  -> create_schedule(
       title = "Morning GitHub Trending to Feishu",
       cronExpr = "0 8 * * *",
       timezone = "Asia/Shanghai",
       blueprint = {
         prompt: "先把 GitHub Trending 解析到 canonical NewsNow source，再获取最新 headlines，整理成简洁列表并发送到飞书目标 xxx。",
         toolAllowlist: ["resolve_news_source", "get_news_headlines", "send_feishu_message"],
         deliveryIntent: { feishuTargetAlias: "xxx" }
       }
     )

next day 08:00
  -> materializer 生成 task_run
  -> worker claim task_run
  -> headless agent 调 resolve_news_source("GitHub Trending")
  -> 调 get_news_headlines("github-trending-today")
  -> 整理内容
  -> 调 send_feishu_message
  -> task_run succeeded
```

这里“获取最新”发生在 run time，而不是 schedule create time。

## 19. 实施顺序

按以下顺序实施：

1. 落本文档
2. 调整 contracts/schema，定义 blueprint schedule 与 `task_runs`
3. 抽出 `runAgentTurn(...)` 核心运行时
4. 实现 materializer 与 worker
5. 增加 schedule CRUD tools
6. 删除 `schedule_news_brief` 与 `delivery.ts`
7. 更新测试与启动 wiring

## 20. 最终决策摘要

本次迁移采用以下明确决策：

1. 只保留 `schedule-triggered autonomous agent worker`
2. `schedule` 是 blueprint，不是 durable execution queue
3. `task_run` 是唯一的具体执行实例
4. 核心 recurrence 只保留 `cronExpr`
5. 后台任务使用 detached headless agent runtime
6. `runtime_turns.conversationId` 改为 nullable，并显式引入 `executionSource`
7. recurring schedule 在 materialize 时推进 cursor，不在成功后推进
8. 删除 `schedule_news_brief` 和所有 hard-coded scheduled workflow

这套模型下，scheduler 不再“知道如何发新闻简报”，它只知道“到点生成 task_run 并交给 agent worker 执行”。
