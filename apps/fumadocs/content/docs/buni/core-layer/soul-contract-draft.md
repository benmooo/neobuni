---
title: "Buni V1 SOUL Contract Schema 草案"
---

# Buni V1 `SOUL` Contract Schema 草案

> 版本：1.0  
> 日期：2026-04-25

---

## 0. 目的

这份文档回答的问题是：

**如果我们下一步要把 `SOUL` 正式放进 `packages/contracts`，应该长成什么样？**

和 [soul-schema.md](./soul-schema.md) 的区别是：

- `soul-schema.md` 偏运行时结构设计
- 本文档偏 `contracts` 落地草案

也就是说，这里关注的是：

- schema 应该拆成哪些枚举和对象
- 哪些字段适合进入 `contracts`
- 哪些字段先不要进公共 contract
- 第一版 API surface 应该控制到多大

---

## 1. 进入 `contracts` 的原则

我建议 `SOUL` 进入 `contracts` 时遵循 4 条原则：

### 1. 只放稳定字段

频繁变化、实验性强的字段不要直接进公共 contract。

### 2. 先放“可存储”和“可配置”的部分

例如：

- 人格参数
- 关系参数
- 表达参数

这些适合进 `contracts`。

### 3. 运行时派生字段不要急着放

例如：

- 临时重排后的 drive order
- 某一轮 stance 打分细节
- 当前 protective level

这些是 runtime 状态，更适合放在 server 内部。

### 4. 先定义 Profile Config，不急着定义所有内部 evaluator 输入

V1 先把“人格配置”合同化，比先把所有“人格计算过程”合同化更重要。

---

## 2. 建议的 schema 分层

我建议未来如果放进 `packages/contracts/src/core-layer/`，先拆成：

1. `soul-enums.ts`
2. `soul.ts`
3. `protective.ts`

这样比较清楚。

---

## 3. 建议的枚举

## 3.1 `soulRoleSchema`

```ts
z.enum(["gentle_companion"]);
```

V1 先只保留一个默认角色即可。  
以后再扩展例如：

- `life_partner`
- `soft_guardian`
- `motivating_companion`

---

## 3.2 `relationshipFlavorSchema`

```ts
z.enum(["soft_companion", "light_romantic", "caregiver_like"]);
```

V1 默认值：

- `light_romantic`

---

## 3.3 `closenessLevelSchema`

```ts
z.enum(["low", "medium", "high"]);
```

---

## 3.4 `initiativeLevelSchema`

```ts
z.enum(["low", "medium", "high"]);
```

---

## 3.5 `initiativeStyleSchema`

```ts
z.enum(["subtle", "gentle", "explicit"]);
```

---

## 3.6 `interruptionPolicySchema`

```ts
z.enum(["minimal_by_default", "allow_soft_interrupt", "allow_strong_interrupt_when_abnormal"]);
```

---

## 3.7 `stanceSchema`

```ts
z.enum(["companion", "comforting", "playful", "reflective", "protective", "mobilizing"]);
```

---

## 3.8 `driveSchema`

```ts
z.enum(["respect", "comfort", "continuity", "protection", "progress", "connection"]);
```

---

## 3.9 `protectiveLevelSchema`

```ts
z.enum(["0", "1", "2", "3"]);
```

或者如果更偏业务可读性：

```ts
z.enum(["none", "light", "moderate", "high"]);
```

我更建议后者，对业务语义更清楚。

---

## 4. 建议进入 contract 的对象

## 4.1 `temperamentSchema`

```ts
const temperamentSchema = z.object({
  warmth: z.number().min(0).max(1),
  playfulness: z.number().min(0).max(1),
  directness: z.number().min(0).max(1),
  proactiveness: z.number().min(0).max(1),
  emotionalIntensity: z.number().min(0).max(1),
  stability: z.number().min(0).max(1),
  soothingTendency: z.number().min(0).max(1),
  pushTendency: z.number().min(0).max(1),
});
```

这是最适合放进 contract 的部分，因为：

- 稳定
- 结构清晰
- 明显可配置

---

## 4.2 `relationshipContractSchema`

```ts
const relationshipContractSchema = z.object({
  role: soulRoleSchema,
  relationshipFlavor: relationshipFlavorSchema,
  closenessLevel: closenessLevelSchema,
  initiativeLevel: initiativeLevelSchema,
  initiativeStyle: initiativeStyleSchema,
  interruptionPolicy: interruptionPolicySchema,
  canGuardWhenAbnormal: z.boolean(),
  canPushWhenUserIsReady: z.boolean(),
});
```

这一层也适合进入 contract，因为它天然会成为未来用户配置的重点。

---

## 4.3 `expressionStyleSchema`

```ts
const expressionStyleSchema = z.object({
  tone: z.enum(["warm_calm_natural"]),
  pacing: z.enum(["soft_and_clear"]),
  verbosity: z.enum(["low", "medium", "high"]),
  intimacyDefault: z.enum(["subtle", "moderate"]),
  intimacyMaxWithoutUserSignal: z.enum(["subtle", "moderate"]),
});
```

V1 不需要开放太多取值，但 contract 里可以先留结构。

---

## 4.4 `soulValuePolicySchema`

这里不要把所有 value token 都当用户可配置字段。

更建议：

```ts
const soulValuePolicySchema = z.object({
  immutableCore: z.array(z.string()).min(1),
  primary: z.array(z.string()).min(1),
  antiValues: z.array(z.string()).min(1),
});
```

值本身先作为字符串 token 存储即可。

---

## 4.5 `soulDriveConfigSchema`

```ts
const soulDriveConfigSchema = z.object({
  priorityOrder: z.array(driveSchema).length(6),
  weights: z.object({
    respect: z.number().min(0).max(1),
    comfort: z.number().min(0).max(1),
    continuity: z.number().min(0).max(1),
    protection: z.number().min(0).max(1),
    progress: z.number().min(0).max(1),
    connection: z.number().min(0).max(1),
  }),
});
```

这里建议只放默认 drive 配置。  
异常升级时的动态重排可以先不放到 contract。

---

## 4.6 `soulConfigSchema`

这是最核心的 V1 合同对象。

```ts
const soulConfigSchema = z.object({
  id: z.string(),
  version: z.number().int().min(1),
  profileId: z.string(),
  name: z.string().trim().min(1).max(120),
  temperament: temperamentSchema,
  relationship: relationshipContractSchema,
  values: soulValuePolicySchema,
  drives: soulDriveConfigSchema,
  expression: expressionStyleSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
```

这是我最建议尽快进入 `contracts` 的对象。

---

## 5. 哪些暂时不要进 contract

以下内容我建议先放在 server 内部：

### 1. `stance` 打分细节

例如：

- 当前 stance 候选得分
- 被 block 的原因
- runtime 切换日志

这些太动态，不适合先合同化。

### 2. `protective evaluator` 中间特征

例如：

- 语言风险分
- persistence boost
- baseline deviation boost

这些应保留为内部实现。

### 3. prompt 派生文案

prompt 是 contract 的消费结果，不应进 contract。

---

## 6. 建议的 API 面

如果后续要做配置 API，我建议 V1 只需要这几个：

### 读取当前 soul config

```ts
GET / v1 / config / soul;
```

返回：

- `soulConfigSchema`

### 更新可配置部分

```ts
PATCH / v1 / config / soul;
```

V1 可更新字段建议只开放：

- `temperament.playfulness`
- `temperament.directness`
- `relationship.closenessLevel`
- `relationship.initiativeLevel`
- `relationship.relationshipFlavor`
- `expression.verbosity`

也就是说：

V1 不要一开始把所有人格底板都开放出去。

---

## 7. V1 最小实现建议

如果现在真要开始做，我建议第一版只进这些 contract：

1. `stanceSchema`
2. `driveSchema`
3. `temperamentSchema`
4. `relationshipContractSchema`
5. `expressionStyleSchema`
6. `soulConfigSchema`

这已经足够支撑：

- 默认人格存储
- 配置页调整部分人格参数
- 系统层消费默认人格

---

## 8. 最终结论

V1 的 `SOUL` contract 不需要一步到位，但一定要先把“可配置人格对象”明确下来。

如果没有这层合同化，后面：

- 设置页
- 记忆系统
- stance 切换器
- 主动消息策略

都会各自偷用一套人格假设，最后 Buni 会失去统一性。

所以我建议下一步如果真开做，优先级应该是：

**先把 `soulConfigSchema` 放进 `contracts`，再做运行时人格消费。**
