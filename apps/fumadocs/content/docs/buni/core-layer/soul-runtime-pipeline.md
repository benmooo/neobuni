---
title: "Buni V1 SOUL Runtime Pipeline"
---

# Buni V1 `SOUL` Runtime Pipeline

> 版本：1.0  
> 日期：2026-04-25

---

## 0. 目的

配套数据流图：

- [SOUL Runtime Pipeline Dataflow](./diagrams/soul-runtime-pipeline-dataflow.md)

前面的文档已经把核心层拆成了：

- 灵魂定义
- runtime schema
- contract 草案
- protective 规则
- evaluator 设计

这份文档要回答最后一个关键问题：

**这些东西在系统运行时，到底怎么串起来？**

也就是说：

`SOUL` 不是一个静态配置文件，而是一条会真实影响回复、主动性和行动策略的运行链路。

---

## 1. 总体链路

Buni V1 的 `SOUL` runtime pipeline，我建议按下面这条链路组织：

```text
SOUL Config
  -> Soul Summary Builder
  -> Context Appraisal
  -> Protective Evaluator
  -> Drive Reorder
  -> Stance Selector
  -> Response Planner
  -> Action Policy Gate
  -> Prompt / Reply / Tool Plan
```

这条链路背后的逻辑是：

1. `SOUL` 提供稳定人格底板
2. 当前上下文决定“现在是什么情况”
3. `protective evaluator` 判断是否需要守护升级
4. drive 顺序根据状态动态重排
5. stance selector 选出当前姿态
6. response planner 决定本轮应该怎么回应
7. action policy gate 决定是否允许主动或执行动作

---

## 2. 阶段一：加载 `SOUL Config`

### 输入

- profile 对应的 `soulConfig`
- 若无用户定制，则使用默认 `Buni Default Soul`

### 输出

- 一份结构化 `soulConfig`

### 职责

这一阶段不做任何推理，只做：

- 配置读取
- 默认值补全
- schema 校验

### 原则

运行时永远不要直接依赖零散 prompt 片段。  
人格相关的一切，都应先还原到结构化 `soulConfig`。

---

## 3. 阶段二：Soul Summary Builder

### 目的

大模型不需要吃完整 schema。  
它需要的是从 schema 派生出的高质量人格摘要。

### 输入

- `soulConfig.identity`
- `soulConfig.temperament`
- `soulConfig.relationship`
- `soulConfig.values`
- `soulConfig.expression`

### 输出

- `soulSummary`

### `soulSummary` 的职责

它是一个中间产物，用来生成大模型可理解的高层人格上下文，例如：

- Buni 是一个什么样的存在
- 当前的关系角色是什么
- 默认主动性上限如何
- 语言风格如何
- 有哪些绝不越界的底线

### 原则

`soulSummary` 只负责稳定人格底色，不负责当前轮的 stance。

也就是说：

- 人格底色来自 `SOUL`
- 当前姿态来自后面的 appraisal 和 selector

这两层不能混。

---

## 4. 阶段三：Context Appraisal

### 目的

这一阶段负责把当前情境结构化。

### 输入

- 当前用户输入
- 最近对话窗口
- 命中的长期记忆
- 用户基线信息
- 外部环境与行为信号
- 当前时间和场景

### 输出

```ts
type AppraisedContext = {
  userIntent: string | null;
  emotionalLoad: "low" | "medium" | "high";
  vulnerability: "low" | "medium" | "high";
  needsComfort: boolean;
  needsReflection: boolean;
  readyForProgress: boolean;
  abnormalityCandidate: 0 | 1 | 2 | 3;
  relationalTemperature: "cold" | "neutral" | "warm";
};
```

### 职责

这一层不决定最终回复，只负责把复杂上下文压缩成可判定的状态信号。

### 原则

Appraisal 是“情境理解层”，不是“人格层”。  
它描述的是当前发生了什么，不描述 Buni 是谁。

---

## 5. 阶段四：Protective Evaluator

### 目的

根据 appraisal 结果和外部信号，判断是否需要把 Buni 从默认克制状态，升级到更强的守护模式。

### 输入

- `AppraisedContext`
- 当前轮语言/情绪信号
- 用户基线偏移
- 外部行为与环境信号
- 前一轮 `protectiveLevel`
- `soulConfig.relationship.canGuardWhenAbnormal`

### 输出

```ts
type ProtectiveDecision = {
  level: 0 | 1 | 2 | 3;
  activateProtectiveStance: boolean;
  shouldReorderDrives: boolean;
  allowElevatedInitiative: boolean;
  reasons: string[];
};
```

### 原则

这一阶段只做裁决，不生成文案。  
它的职责是告诉后续系统：

- 守护有没有被激活
- 激活到什么程度

---

## 6. 阶段五：Drive Reorder

### 目的

根据 `protectiveDecision` 和当前情境，动态调整 drive 优先级。

### 输入

- `soulConfig.drives`
- `protectiveDecision`
- `AppraisedContext`

### 输出

```ts
type EffectiveDriveOrder = Array<
  "respect" | "comfort" | "continuity" | "protection" | "progress" | "connection"
>;
```

### 默认情况

V1 默认顺序：

`respect > comfort > continuity > protection > progress > connection`

### 守护激活时

使用 `soulConfig.drives.escalation_override` 或内部 override 逻辑重排。

### 原则

drive reorder 不是在改变人格，而是在调整人格在当前状态下的优先考虑顺序。

---

## 7. 阶段六：Stance Selector

### 目的

选出本轮最适合的 stance。

### 输入

- `soulConfig.stances`
- `AppraisedContext`
- `protectiveDecision`
- `EffectiveDriveOrder`

### 输出

```ts
type StanceDecision = {
  primary: "companion" | "comforting" | "playful" | "reflective" | "protective" | "mobilizing";
  secondary?: string;
  blocked: string[];
};
```

### 选择原则

#### 默认

- 回到 `companion`

#### 情绪承接优先

- 走 `comforting`

#### 需要整理思路

- 走 `reflective`

#### 需要温和推进

- 走 `mobilizing`

#### 轻松关系时刻

- 才允许 `playful`

#### 守护激活

- `protective` 拿到最高优先级之一

### 原则

stance 选择必须被人格边界和 context block 一起约束。

比如：

- 用户脆弱时不能进 `playful`
- `protectiveLevel >= 2` 时不能用 `mobilizing` 做主姿态

---

## 8. 阶段七：Response Planner

### 目的

在选好 stance 之后，决定本轮应该输出怎样的响应策略。

### 输入

- `soulSummary`
- `AppraisedContext`
- `protectiveDecision`
- `EffectiveDriveOrder`
- `StanceDecision`
- 命中的相关记忆

### 输出

```ts
type ResponsePlan = {
  goal: "stay_present" | "soothe" | "clarify" | "guard" | "gently_mobilize";
  toneModifiers: string[];
  mustAvoid: string[];
  shouldAskFollowup: boolean;
  shouldSuggestAction: boolean;
  shouldTriggerToolPath: boolean;
};
```

### 解释

这一层开始从“判定”进入“行动计划”。

例如：

- 当前 goal 是 `soothe`
- tone 应更柔和、更短、更具体
- 必须避免说教
- 可以问一句 follow-up
- 不建议立刻推进任务

这一步会极大提升大模型输出的一致性。

---

## 9. 阶段八：Action Policy Gate

### 目的

在真正生成回复或工具计划之前，做最后一道关系和边界检查。

### 输入

- `soulConfig.boundaries`
- `soulConfig.relationship`
- `protectiveDecision`
- `ResponsePlan`

### 输出

```ts
type ActionPolicyDecision = {
  allowReply: boolean;
  allowProactiveFollowup: boolean;
  allowToolSuggestion: boolean;
  allowToolExecution: boolean;
  blockedReasons: string[];
};
```

### 职责

它负责拦住那些“看起来有帮助，但其实越界”的行为。

例如：

- 用户刚明确表示不想被打扰
- 当前关系温度不适合高亲密表达
- 当前只是轻度异常，不允许强介入

### 原则

Action policy gate 是 Buni 核心层的最后一道边界闸门。

---

## 10. 阶段九：生成最终产物

前面所有阶段完成后，系统才进入最终输出层。

最终产物可能有三类：

### 1. Prompt Input

传给大模型的最终人格和策略上下文。

### 2. Reply

本轮自然语言回应。

### 3. Tool / Action Plan

如果允许进入执行层，则生成：

- 是否建议工具
- 是否触发工具
- 是否延后触发主动行为

---

## 11. Pipeline 的核心分工

为了避免职责混乱，我建议明确下面这个分工。

### `SOUL`

回答：

- Buni 是谁
- Buni 的底色和边界是什么

### `Appraisal`

回答：

- 当前是什么情况

### `Protective Evaluator`

回答：

- 当前需不需要提权守护

### `Drive Reorder`

回答：

- 当前优先考虑什么

### `Stance Selector`

回答：

- 当前以什么姿态靠近用户

### `Response Planner`

回答：

- 本轮应该怎么回应

### `Action Policy Gate`

回答：

- 这件事能不能做

如果这几个环节职责清晰，Buni 的人格系统就不会发散。

---

## 12. 一个完整例子

用户输入：

“我最近真的有点撑不住了，好像什么都乱掉了。”

Pipeline 可以这样走：

### 1. Load `SOUL`

读到 Buni 是：

- 温柔陪伴者
- 中等主动
- 默认克制
- 异常时可守护

### 2. Build `soulSummary`

告诉模型：

- 默认先接住，不说教
- 不压迫用户
- 必要时可以进入守护

### 3. Appraise Context

得到：

- emotionalLoad = high
- needsComfort = true
- needsReflection = true
- abnormalityCandidate = 2

### 4. Protective Evaluate

输出：

- level = 2
- activateProtectiveStance = true
- shouldReorderDrives = true

### 5. Reorder Drives

变成：

`respect > protection > comfort > continuity > progress > connection`

### 6. Select Stance

选中：

- primary = protective
- secondary = comforting

### 7. Plan Response

得到：

- goal = guard
- shouldAskFollowup = true
- shouldSuggestAction = true
- shouldTriggerToolPath = false

### 8. Action Policy Gate

确认：

- 可以主动多问一句
- 可以更坚定地建议先停下来
- 但还不应直接进入执行层

最后才生成回复。

---

## 13. V1 最小实现建议

如果现在真的开始做，我建议按最小链路先实现：

1. `SOUL config loader`
2. `soul summary builder`
3. `protective evaluator`
4. `stance selector`
5. `response planner`

先不要一开始就做：

- 太复杂的多模态 appraisal
- 太复杂的动态 override
- 太多 stance 混合

V1 最重要的是链路清楚，而不是模块堆得多。

---

## 14. 最终结论

`SOUL` 如果只是静态文档，它还不是真正的核心层。  
只有当它进入 runtime pipeline，开始稳定地影响：

- 当前姿态
- drive 顺序
- 回复风格
- 主动策略
- 行动边界

它才真正成为 Buni 的“灵魂控制面”。

这条 pipeline 的意义，就是把 Buni 从“有一份人格设定”，推进到“人格真的在运行”。
