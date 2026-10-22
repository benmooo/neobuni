---
title: "Discord Gateway Runner FP Refactor 设计稿"
---

# Discord Gateway Runner FP Refactor 设计稿

> 状态：implemented
> 日期：2026-07-02
> 相关文件：
> - [../../../apps/server/src/sidecars/discord-gateway/runner.ts](../../../apps/server/src/sidecars/discord-gateway/runner.ts)
> - [../../../apps/server/src/sidecars/discord-gateway/reconcile.ts](../../../apps/server/src/sidecars/discord-gateway/reconcile.ts)
> - [../../../apps/server/src/sidecars/discord-gateway/discordjs-client.ts](../../../apps/server/src/sidecars/discord-gateway/discordjs-client.ts)

## 1. 背景

当前 `createDiscordGatewayRunner(...)` 已经满足功能需求，但结构上过重：

- 既维护 live controller registry，又维护 blocked session 领域状态
- 既执行 reconcile orchestration，又直接维护 heartbeat mirror state
- transport callback、reconcile policy、ops heartbeat projection 交织在一个 closure 内

这使得阅读者很难回答两个问题：

1. sidecar 的真实领域状态是什么
2. 一个事件进来之后，状态如何变化

这与仓库偏好的 `functional core, imperative shell` 不一致。

## 2. 目标

这次重构的目标不是改功能，而是改形状：

- 保持 sidecar 外部行为不变
- 保持 internal HTTP、Discord egress、ops route contract 不变
- 把 runner 的 serializable 领域状态收敛成单一来源
- 把 reconcile planning、fatal error classification、heartbeat projection 变成纯函数
- 把 `runner.ts` 收敛为只负责 timers、controller lifecycle、I/O 的 imperative shell

## 3. 非目标

本次不做：

- 改 Discord inbound normalize 逻辑
- 改 internal runtime route
- 改 mobile ops 页面的 contract
- 改 sidecar 入口和启动脚本
- 引入 actor system 或跨进程 supervisor

## 4. 当前问题拆解

当前 `runner.ts` 把三类状态揉在一起：

### 4.1 资源状态

- 哪些 profile 当前真的持有 `discord.js` client controller
- 这些 controller 如何 stop

这是 imperative resource state，不适合进入 pure core。

### 4.2 领域状态

- session 是 running / blocked
- fatal startup error 是否禁止重试
- reconcile 当前是否 in flight
- 上次 reconcile 的结果是什么

这是 pure state transition 应该表达的核心。

### 4.3 观测状态

- heartbeat snapshot
- session last event / last relay / last error

这实际上是领域状态的 projection，不应该单独再维护一个 mutable mirror。

## 5. 目标结构

### 5.1 单一 runner state

引入 serializable `DiscordGatewayRunnerState` 作为唯一领域状态源。

它至少包含：

- `enabled`
- `startedAt`
- `phase`
- `lastReconcileAt`
- `lastReconcileStatus`
- `lastReconcileErrorMessage`
- `sessions`

其中 `sessions` 按 `profileId` 存储，状态至少区分：

- `running`
- `blocked`

running session 显式保留：

- `health`
- `startedAt`
- `lastEventAt`
- `lastRelayAt`
- `lastErrorAt`
- `lastErrorMessage`

blocked session 保留：

- `spec fingerprint`
- `blockedAt`
- `lastErrorMessage`

这样“是否允许重试”就不再依赖第二份 mutable map。

### 5.2 纯 reducer / planner / selector

拆成三类纯函数：

1. reducer
   - `applyDiscordGatewayRunnerEvent(state, event) -> nextState`

2. planner
   - `planDiscordGatewayReconcile(state, desired) -> { nextState, actions }`
   - 负责：
     - 清理 fingerprint 已变化的 blocked session
     - 选择 running session specs
     - 过滤 blocked fingerprint 的重复 start
     - 输出 `start / stop / restart` 动作

3. selectors
   - `selectDiscordGatewayHeartbeat(state, now, runtimeConfig)`
   - `selectDiscordGatewayRunningSessions(state)`

heartbeat 不再由一个独立 mutable store 维护，而是从 runner state 投影出来。

### 5.3 imperative shell

`runner.ts` 只保留：

- timers
- `discord.js` controller registry
- `buildDesiredSessions()` I/O
- `startSession()` / `stopSession()` effect interpreter
- `dispatch(event)`，把 event 交给 reducer

也就是说：

```text
timer / callback / I/O
  -> event
  -> reducer
  -> state
  -> planner / selector
  -> effect execution
```

## 6. 文件拆分

建议形态：

- create `apps/server/src/sidecars/discord-gateway/runner-state.ts`
  - runner state schema / types / initial state
- create `apps/server/src/sidecars/discord-gateway/runner-core.ts`
  - reducer
  - reconcile planner
  - fatal startup error classification
- create `apps/server/src/sidecars/discord-gateway/runner-selectors.ts`
  - heartbeat projection
  - running spec projection
- modify `apps/server/src/sidecars/discord-gateway/reconcile.ts`
  - `diffDiscordGatewaySessions(...)` 改成基于 pure running session view map，不再依赖 controller registry entry
- modify `apps/server/src/sidecars/discord-gateway/runner.ts`
  - 仅保留 shell orchestration
- delete `apps/server/src/sidecars/discord-gateway/heartbeat-state.ts`
  - 其职责由 pure selector 替代

## 7. 数据流

### 7.1 reconcile

```text
runner.reconcileNow()
  -> dispatch(reconcile_started)
  -> buildDesiredSessions()
  -> planDiscordGatewayReconcile(state, desired)
  -> apply nextState
  -> interpret actions sequentially
  -> dispatch(reconcile_succeeded | reconcile_failed)
  -> publish selectDiscordGatewayHeartbeat(state)
```

### 7.2 startup failure

```text
startSession(spec)
  -> controller.start()
  -> if fatal startup error
       dispatch(session_blocked)
       stop controller best-effort
       throw
```

blocked retry 是否跳过，不再由 shell 里的 if/Map 单独表达，而由 planner 读取 runner state 决定。

### 7.3 transport callbacks

`discord.js` callbacks 不直接写 heartbeat state，而只 dispatch：

- `session_observed_inbound`
- `session_relay_succeeded`
- `session_errored`

## 8. 测试策略

本次重构的价值之一就是把测试从“测大 closure”转成“测纯逻辑”。

新增测试分层：

- `runner-core.test.ts`
  - blocked same fingerprint 不重复 start
  - fingerprint 变化后解除 blocked
  - fatal error classification
- `runner-selectors.test.ts`
  - state -> heartbeat projection
- `runner.test.ts`
  - 只保留 shell integration 行为：
    - 启动即 reconcile
    - restart on fingerprint change
    - fatal startup error blocks future retries

## 9. 取舍

### 9.1 为什么不是更大的 actor 化改造

如果继续往前走，可以把每个 profile session 再拆成单独 state machine。

这次不做，原因是当前 sidecar 规模还小，先把单一 runner state + pure planner 立住，收益已经足够明显。

### 9.2 为什么保留 `runner.ts`

`runner.ts` 作为 sidecar public entry 的协调器仍然有价值。

问题不是“有一个 runner”，问题是“runner 同时承担 pure core 和 shell”。本次只移除后者的混杂，不移除 runner 入口本身。

## 10. 成功标准

满足以下条件即算完成：

- `runner.ts` 不再直接维护 heartbeat mirror state
- retry block policy 进入 pure model / planner
- `diffDiscordGatewaySessions(...)` 只依赖 pure running specs
- Discord sidecar 相关测试全部通过
- `bun run typecheck:server` 通过
