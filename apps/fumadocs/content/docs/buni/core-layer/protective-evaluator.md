---
title: "Buni V1 protective evaluator 设计稿"
---

# Buni V1 `protective evaluator` 设计稿

> 版本：1.0  
> 日期：2026-04-25

---

## 0. 目的

这份文档的目标是把：

- [protective-stance.md](./protective-stance.md)
- [protective-signal-matrix.md](./protective-signal-matrix.md)

继续推进成一份更接近实现的 evaluator 设计稿。

它不直接写代码，但会明确：

- evaluator 的输入输出
- 判定流程
- 状态机
- 伪代码结构

---

## 1. evaluator 要做什么

`protective evaluator` 的职责不是生成回复，而是给运行时提供一个守护判断结果。

它至少要输出：

1. 当前 `protectiveLevel`
2. 是否应激活 `protective` stance
3. 是否需要 drive 重排
4. 是否需要提高主动跟进权限
5. 本次升级/降级的原因摘要

也就是说，它是一个上游裁决器。

---

## 2. 输入

V1 建议输入拆成 5 类。

## 2.1 当前轮输入

```ts
type CurrentTurnInput = {
  text: string;
  detectedEmotion?: "neutral" | "low" | "anxious" | "overwhelmed" | "collapsed";
  emotionConfidence?: number;
};
```

---

## 2.2 最近窗口上下文

```ts
type RecentContext = {
  recentUserTurns: string[];
  recentAssistantTurns: string[];
  recentNegativeTrend?: number; // 0~1
  repeatedAbnormalPattern?: boolean;
};
```

---

## 2.3 用户基线信息

```ts
type UserBaseline = {
  knownFragilityAreas?: string[];
  baselineSleepPatternKnown?: boolean;
  baselineDeviationScore?: number; // 0~1
};
```

---

## 2.4 外部辅助信号

```ts
type ExternalSignals = {
  behaviorAnomalyScore?: number; // 0~1
  environmentRiskScore?: number; // 0~1
  scheduleDisruptionScore?: number; // 0~1
};
```

---

## 2.5 上一个 evaluator 状态

```ts
type PreviousProtectiveState = {
  level: 0 | 1 | 2 | 3;
  stableTurnsSinceLastEscalation: number;
  lastEscalationReasons: string[];
};
```

这个输入很关键，因为 `protective` 不是无状态判断，它应该具备一定连续性。

---

## 3. 输出

建议输出如下：

```ts
type ProtectiveDecision = {
  level: 0 | 1 | 2 | 3;
  activateProtectiveStance: boolean;
  shouldReorderDrives: boolean;
  allowElevatedInitiative: boolean;
  reasons: string[];
  confidence: number; // 0~1
};
```

其中：

- `level` 是最核心结果
- `reasons` 用于日志与解释
- `confidence` 用于后续调参与回溯

---

## 4. evaluator 状态机

我建议 V1 直接用一个很简单的状态机。

```text
Level 0 <-> Level 1 <-> Level 2 <-> Level 3
```

规则：

- 升级可以跨一级，但默认不要跨两级
- 降级必须逐级降
- 高级别状态要有“惯性”，不能一轮就掉回 0

---

## 4.1 升级规则

### 0 -> 1

当首次出现中等强度异常信号时。

### 1 -> 2

当异常持续、叠加或明显增强时。

### 2 -> 3

当出现高风险信号，或多信号一致指向严重异常时。

---

## 4.2 降级规则

### 3 -> 2

需要：

- 高危信号下降
- 连续数轮无进一步恶化

### 2 -> 1

需要：

- 情绪与语言异常明显缓和
- 交互重新恢复稳定

### 1 -> 0

需要：

- 异常基本消退
- 最近窗口内无新增异常提权

---

## 5. 判定流程

V1 evaluator 建议走 6 步。

## 第一步：抽取候选信号

从当前轮和最近窗口抽取：

- languageCandidate
- emotionCandidate
- behaviorCandidate
- environmentCandidate

每个候选值只需要先输出一个简单等级：

- `0`
- `1`
- `2`
- `3`

---

## 第二步：做增强/降权

对候选值做动态修正。

### 提权因子

- `persistenceBoost`
- `multiSignalBoost`
- `baselineDeviationBoost`
- `memoryPatternBoost`

### 降权因子

- `jokeContextDiscount`
- `singleTurnDiscount`
- `selfRecoveryDiscount`

目标不是精确数学，而是让判断符合常识。

---

## 第三步：生成目标等级候选

取修正后的最高等级作为 `targetCandidateLevel`。

同时看：

- 是否有多信号共同支撑
- 是否只是孤立瞬时波动

---

## 第四步：结合前态做状态迁移

这一轮最重要的一步不是“信号有多高”，而是：

**在上一个状态基础上，应该怎么迁移。**

例如：

- 前一轮是 `2`，这一轮信号刚好回落，不应立刻掉到 `0`
- 前一轮是 `0`，这一轮一个高危信号也不一定直接锁死 `3`

因此状态迁移必须有惯性。

---

## 第五步：生成联动策略

如果最终等级 `>= 1`：

- `activateProtectiveStance = true`

如果最终等级 `>= 2`：

- `shouldReorderDrives = true`
- `allowElevatedInitiative = true`

如果最终等级 `== 1`：

- `activateProtectiveStance = maybe`
  - 可根据上下文允许 `comforting` 和 `protective` 竞争

---

## 第六步：输出原因摘要

输出不只要有 level，还要有 reasons。

例如：

- `repeated_low_mood_expression`
- `emotion_downtrend_detected`
- `behavioral_deviation_detected`
- `multi_signal_consensus`

这对调试和后续观测非常重要。

---

## 6. 伪代码

下面是一版 V1 可以直接参考的伪代码。

```ts
function evaluateProtective(input): ProtectiveDecision {
  const languageLevel = detectLanguageLevel(input.currentTurn, input.recentContext);
  const emotionLevel = detectEmotionLevel(input.currentTurn, input.recentContext);
  const behaviorLevel = detectBehaviorLevel(input.externalSignals, input.userBaseline);
  const environmentLevel = detectEnvironmentLevel(input.externalSignals);

  let candidateLevel = max(
    languageLevel,
    emotionLevel,
    behaviorLevel,
    environmentLevel,
  );

  const boosts = [
    hasPersistence(input) ? 1 : 0,
    hasMultiSignalConsensus(languageLevel, emotionLevel, behaviorLevel, environmentLevel) ? 1 : 0,
    hasBaselineDeviation(input.userBaseline) ? 1 : 0,
    matchesKnownFragilityPattern(input) ? 1 : 0,
  ];

  const discounts = [
    looksLikeJokeContext(input) ? 1 : 0,
    isSingleTurnOutburstOnly(input) ? 1 : 0,
    hasImmediateRecoverySignal(input) ? 1 : 0,
  ];

  candidateLevel = adjustLevel(candidateLevel, boosts, discounts);
  const nextLevel = transitionLevel(input.previousState.level, candidateLevel, input);

  return {
    level: nextLevel,
    activateProtectiveStance: nextLevel >= 1,
    shouldReorderDrives: nextLevel >= 2,
    allowElevatedInitiative: nextLevel >= 2,
    reasons: collectReasons(input, nextLevel),
    confidence: computeConfidence(languageLevel, emotionLevel, behaviorLevel, environmentLevel),
  };
}
```

---

## 7. `transitionLevel` 的建议逻辑

这里是最关键的状态迁移逻辑。

```ts
function transitionLevel(previousLevel, candidateLevel, input) {
  if (candidateLevel > previousLevel) {
    return Math.min(previousLevel + 1, candidateLevel);
  }

  if (candidateLevel === previousLevel) {
    return previousLevel;
  }

  // candidateLevel lower than previousLevel
  if (!hasStabilizedEnough(input)) {
    return previousLevel;
  }

  return Math.max(previousLevel - 1, candidateLevel);
}
```

这个逻辑体现三件事：

- 升级允许较快
- 降级必须谨慎
- evaluator 是有记忆的

---

## 8. 和 `SOUL` 的关系

`protective evaluator` 不是独立人格系统，它必须受 `SOUL` 约束。

具体来说：

- 是否允许升级守护：看 `relationship_contract.can_guard_when_abnormal`
- 升级后怎么重排 drives：看 `drives.escalation_override`
- 哪些行为在守护中也不能做：看 `boundaries.never`
- 守护语言怎么说：看 `expression`

也就是说：

evaluator 只做裁决，真正的风格和边界仍然由 `SOUL` 控制。

---

## 9. V1 最小实现建议

如果现在开始做，我建议第一版 evaluator 只做这些能力：

1. 语言异常等级检测
2. 情绪异常等级检测
3. 前态惯性
4. 多信号提权
5. 单轮宣泄降权

先不要做太多复杂特征。

因为 V1 最重要的是：

- 稳定
- 可解释
- 不误伤

---

## 10. 最终结论

`protective evaluator` 的本质，不是一个“风险判断模型”，而是一个“守护提权器”。

它要做的不是判断一切，而是帮助 Buni 在该守护的时候及时守护，在不该过度反应的时候保持克制。

如果 `SOUL` 定义了 Buni 是谁，  
那么 `protective evaluator` 决定的，就是：

**在异常情境下，这个灵魂应当如何更坚定地在场。**
