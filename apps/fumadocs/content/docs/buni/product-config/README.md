---
title: "Buni Settings 与 SoulSection 重构方案"
---

# Buni Settings 与 SoulSection 重构方案

> 版本：1.0  
> 日期：2026-04-25

---

## 0. 目的

这份文档回答一个当前很关键的问题：

**在 `soul schema` 和 `soul runtime pipeline` 已经建立之后，Buni 的 settings 页面应该怎么重构？**

结论先写在前面：

**settings 页本身不 obsolete，但其中“AI 性格 = 一段自由文本”的配置方式已经过时。**

接下来 settings 的定位，应从：

- 旧形态：零散系统配置 + 自由文本 persona

升级为：

- 新形态：系统配置入口 + `SOUL` 可配置投影入口

也就是说：

- provider、记忆、外观仍然属于 settings
- 人格相关配置不再依赖自由文本 prompt
- `SOUL` runtime pipeline 继续留在系统内部
- settings 只暴露给用户真正可理解、可安全修改的字段

---

## 1. 当前问题

现有 settings 页面大致包含：

- 外观
- Agent 配置
- Chat provider
- Memory embedding provider
- Memory reasoning provider

其中真正落后的部分是 `AgentSection`。

它的问题不是“功能完全没用”，而是它所代表的配置模型已经和当前架构脱节：

- `aiPersona` 是自由文本
- `chat` 主链已经开始消费结构化 `soulConfig`
- runtime 又会继续经过：
  - context appraisal
  - protective evaluator
  - drive reorder
  - stance selector
  - response planner

这会造成双源人格问题：

- 一份人格来自 `agent.aiPersona`
- 一份人格来自 `soulConfig`
- 运行时真正起作用的又是 `soul runtime pipeline`

如果继续保留当前设置形态，后面会越来越混乱。

---

## 2. 重构原则

Settings 重构建议遵循 5 条原则。

### 2.1 Settings 保留，但重新分层

不删除 settings 页面，而是调整它的内部信息架构。

### 2.2 用户编辑的是 `SOUL` 的投影，不是 runtime 本身

用户可以编辑：

- 关系风格
- 主动性
- 亲近程度
- 表达偏好

用户不直接编辑：

- protective evaluator
- stance selector
- response planner
- drive reorder

这些属于平台核心逻辑。

### 2.3 先开放高理解度字段

V1 只开放用户容易理解、且不会破坏系统稳定性的字段。

### 2.4 保持“功能层”和“灵魂层”分离

应区分：

- 系统能力配置
- 人格配置

两者不能继续混在一个 `AgentSection` 里。

### 2.5 平滑迁移，不一次性推翻

已有字段里：

- `aiName`
- `userName`
- `userPersona`

依然有价值，可以保留。

但：

- `aiPersona`

应进入废弃兼容状态，不再作为主入口。

---

## 3. 新的页面定位

Settings 页未来应承担两类配置：

### 3.1 系统设置

负责：

- 外观
- 模型提供商
- 记忆 provider
- 其他技术能力开关

### 3.2 Buni 设置

负责：

- Buni 的名字
- `SOUL` 可配置字段
- 关于用户的资料

一句话概括：

**Settings 不再是“给 prompt 填几段文案”，而是“管理 Buni 的系统能力和可配置灵魂投影”。**

---

## 4. 目标信息架构

建议把 settings 重组为下面 4 个一级区块。

## 4.1 外观

保留：

- 主题
- 深色模式

这是纯 UI 配置，不受 `SOUL` 影响。

## 4.2 Buni

这是新的核心区块，取代现在的 `AgentSection` 中人格部分。

建议包含：

- Buni 名字
- SoulSection
- 灵魂摘要卡

## 4.3 你的资料

建议独立成一个区块，避免混进“AI 人格”。

包含：

- 你的名字
- 关于你

后续也可以承接更多 user profile 信息。

## 4.4 模型与记忆

收纳所有 provider 配置：

- Chat provider
- Memory embedding
- Memory reasoning

后续如果还有工具、语音、视觉、多模态等能力，也应优先归到这一类，而不是塞进 `AgentSection`。

---

## 5. SoulSection V1 可编辑字段清单

V1 不应把整份 `soul schema` 暴露给用户。

只建议开放以下 6 个字段。

## 5.1 关系风格

字段映射：

- `relationship.relationshipFlavor`

建议值：

- `soft_companion`
- `light_romantic`
- `caregiver_like`

用户文案建议：

- 陪伴感更强
- 轻微恋人感
- 更照顾型

## 5.2 亲近程度

字段映射：

- `relationship.closenessLevel`

建议值：

- `low`
- `medium`
- `high`

用户文案建议：

- 克制
- 自然
- 更亲近

## 5.3 主动性

字段映射：

- `relationship.initiativeLevel`

建议值：

- `low`
- `medium`
- `high`

用户文案建议：

- 少打扰
- 适度主动
- 更常主动关心

## 5.4 轻松感

字段映射：

- `temperament.playfulness`

控件建议：

- Slider

用户文案建议：

- 更稳
- 稍微调皮

## 5.5 直给程度

字段映射：

- `temperament.directness`

控件建议：

- Slider

用户文案建议：

- 更委婉
- 更直接

## 5.6 回复篇幅

字段映射：

- `expression.verbosity`

建议值：

- `low`
- `medium`
- `high`

用户文案建议：

- 简短
- 适中
- 更展开

---

## 6. SoulSection V1 不开放的字段

以下字段即便已经存在于 schema 中，也不建议在 V1 进入用户设置页。

## 6.1 不开放给用户编辑

- `values`
- `drives.priorityOrder`
- `drives.weights`
- `stances`
- `boundaries`
- `runtime_policy`
- `expression.intimacy.*`
- `relationship.initiativeStyle`
- `relationship.interruptionPolicy`
- `relationship.canGuardWhenAbnormal`
- `relationship.canPushWhenUserIsReady`

原因很简单：

- 用户理解成本高
- 很容易破坏整体人格稳定性
- 这些字段更像平台内核，而不是偏好设置

## 6.2 可以展示但不编辑

可以做成只读摘要卡的内容：

- 当前角色：`gentle_companion`
- 默认守护策略：默认克制，异常时升级守护
- 默认驱动顺序：`respect > comfort > continuity > protection > progress > connection`
- 默认姿态集合：`companion / comforting / reflective / protective / mobilizing / playful`

这样用户会知道自己用的 Buni 是什么样的，但不会被 runtime 细节淹没。

---

## 7. AgentSection 的迁移方案

当前 `AgentSection` 不能简单保留原样。

建议拆成两部分。

## 7.1 继续保留

- `aiName`
- `userName`
- `userPersona`

其中：

- `userPersona` 后续建议改名为“关于你”或 `aboutYou`

这样更贴近真实语义。

## 7.2 进入废弃兼容状态

- `aiPersona`

### 处理建议

V1.1 阶段：

- UI 上不再主推 `aiPersona`
- 不再用“AI 性格”命名
- 后端字段先保留，避免一次性破坏兼容

V1.2 或后续阶段：

- chat 主链彻底不再依赖 `aiPersona`
- 配置页移除该输入项
- 必要时提供一次性迁移逻辑

---

## 8. SoulSection 的 UI 建议

V1 不需要做得很重。

建议采用：

- 3 个枚举选择
- 2 个滑杆
- 1 个篇幅选择
- 1 张只读摘要卡

推荐结构如下：

## 8.1 Buni 名字

- 输入框

## 8.2 关系设定

- 关系风格
- 亲近程度
- 主动性

## 8.3 表达设定

- 轻松感
- 直给程度
- 回复篇幅

## 8.4 灵魂摘要

只读显示：

- 当前关系角色
- 默认守护策略
- 当前会影响互动的核心倾向

---

## 9. 与 runtime pipeline 的关系

`SoulSection` 并不是 runtime pipeline 的编辑器。

它只负责配置 runtime pipeline 的输入底板。

也就是说：

- `SoulSection` 编辑的是 `SOUL Config`
- runtime pipeline 继续负责：
  - Soul Summary Builder
  - Context Appraisal
  - Protective Evaluator
  - Drive Reorder
  - Stance Selector
  - Response Planner

用户改的是人格底板，不是每一轮的策略器。

这是非常关键的边界。

---

## 10. 建议的实施顺序

建议按 3 步推进。

## 第一步：重组页面结构

把 settings 重新组织为：

- 外观
- Buni
- 你的资料
- 模型与记忆

先完成信息架构层面的纠偏。

## 第二步：上线 SoulSection V1

先开放 6 个字段：

- `relationship.relationshipFlavor`
- `relationship.closenessLevel`
- `relationship.initiativeLevel`
- `temperament.playfulness`
- `temperament.directness`
- `expression.verbosity`

## 第三步：废弃 `aiPersona`

在 UI 上移除主入口，逐步退出历史角色。

---

## 11. 最终结论

当前 settings 页不需要删除，但必须完成一次角色升级。

升级后的目标不是：

- 再写一段更漂亮的 persona prompt

而是：

- 让用户通过稳定、可理解的设置项，配置 Buni 的灵魂投影
- 让系统继续通过结构化 `SOUL` 和 runtime pipeline 保持人格一致性

因此，建议正式把 settings 的方向定为：

**系统配置页 + SoulSection 配置页，而不是自由文本 persona 配置页。**
