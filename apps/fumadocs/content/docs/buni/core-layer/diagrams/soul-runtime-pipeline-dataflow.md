---
title: "SOUL Runtime Pipeline — 函数式数据流图"
---

# SOUL Runtime Pipeline — 函数式数据流图

> 配套文档：[soul-runtime-pipeline.md](../soul-runtime-pipeline.md)
>
> 每张图聚焦不同层次的细节，遵循当前统一的 Mermaid 规则：用形状表达语义，用更保守的标签写法保证渲染稳定。

---

## 图例 Legend

|  形状   | 含义                | 用法                                                       |
| :-----: | ------------------- | ---------------------------------------------------------- |
| `[/ /]` | 外部输入 / 输出     | `latestUserText`、`Prompt Input`、`Reply`                  |
|  `[ ]`  | 数据 / Contract     | `SoulSummary`、`ProtectiveDecision`、`ResponsePlan`        |
| `[[ ]]` | 纯函数              | `buildSoulSummary`、`appraiseContext`、`buildResponsePlan` |
|  `{ }`  | Gate / 决策         | `Action Policy Gate`                                       |
| `(( ))` | 事件 / side-channel | observability signal、fallback signal                      |

说明：

- `Runtime` 的复杂度优先通过 `subgraph` / lane 表达，而不是再引入单独的“runtime 节点”
- 节点文本统一避免使用容易触发 Mermaid 歧义解析的 `||`、字面量 `\n`、以及节点内部的 `|`

---

## Chart 1: Pipeline 总览 (Linear Overview)

左 → 右展示完整 8 阶段主链路，直观呈现**时序**与**层次**。

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '14px', 'lineColor': '#94a3b8'}}}%%
flowchart LR
    classDef ext fill:#fff7ed,stroke:#f97316,color:#7c2d12,font-weight:bold
    classDef data fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,font-weight:bold
    classDef fn fill:#ecfdf5,stroke:#16a34a,color:#166534,font-weight:bold
    classDef gate fill:#fef3c7,stroke:#d97706,color:#92400e,font-weight:bold

    SC[soulConfig]:::data
    SB[[Soul Summary Builder]]:::fn
    SS[soulSummary]:::data

    CTX[/userInput<br/>conversation<br/>memories<br/>env signals/]:::ext
    CA[[Context Appraisal]]:::fn
    AC[AppraisedContext]:::data

    PE[[Protective Evaluator]]:::fn
    PD[ProtectiveDecision]:::data

    DR[[Drive Reorder]]:::fn
    EDO[EffectiveDriveOrder]:::data

    STS[[Stance Selector]]:::fn
    STD[StanceDecision]:::data

    RP[[Response Planner]]:::fn
    RPL[ResponsePlan]:::data

    APG{Action Policy Gate}:::gate
    APD[ActionPolicyDecision]:::data

    GEN[[Generator]]:::fn
    OUT[/Prompt Input<br/>Reply<br/>Tool Plan/]:::ext

    SC --> SB --> SS
    CTX --> CA --> AC
    AC --> PE --> PD
    PD --> DR --> EDO
    EDO --> STS --> STD
    SS & STD --> RP --> RPL
    RPL & PD --> APG --> APD
    APD & SS --> GEN --> OUT
```

---

## Chart 2: Phase 1–2 SOUL Layer — 人格底板

`soulConfig` 各字段 → `loadSoulConfig` → `Soul Summary Builder` → `soulSummary`

```mermaid
flowchart TD
    classDef data fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,font-weight:bold
    classDef fn fill:#ecfdf5,stroke:#16a34a,color:#166534,font-weight:bold

    subgraph RAW["Raw soulConfig 字段"]
        direction LR
        ID[identity]:::data
        TM[temperament]:::data
        RL[relationship]:::data
        VL[values]:::data
        EX[expression]:::data
        DV[drives]:::data
        ST[stances]:::data
        BD[boundaries]:::data
    end

    LOAD[[① loadSoulConfig<br/>默认值补全 · schema 校验]]:::fn
    SCONF[soulConfig structured]:::data
    SBUILD[[② Soul Summary Builder<br/>派生高层人格摘要]]:::fn
    SS[soulSummary<br/>Buni identity · relationship role<br/>initiative ceiling · language style<br/>boundary baseline]:::data

    RAW --> LOAD --> SCONF --> SBUILD --> SS
```

> `soulSummary` 只负责**稳定人格底色**，不决定当前 stance。  
> `drives` / `stances` / `boundaries` 字段将在后续阶段被分别取用。

---

## Chart 3: Phase 3–4 Context & Guard Layer — 情境感知 + 守护判定

外部原始输入 → `Context Appraisal` → `AppraisedContext` → `Protective Evaluator` → `ProtectiveDecision`

```mermaid
flowchart TD
    classDef data fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,font-weight:bold
    classDef fn fill:#ecfdf5,stroke:#16a34a,color:#166534,font-weight:bold
    classDef ext fill:#f8fafc,stroke:#94a3b8,color:#334155

    subgraph EXT["外部原始输入 (Raw Inputs)"]
        direction LR
        UI[/userInput/]:::ext
        CW[/conversation window/]:::ext
        LM[/long-term memories/]:::ext
        UB[/user baseline/]:::ext
        ES[/env and behavior signals/]:::ext
        TS[/time and scene/]:::ext
    end

    CA[[③ Context Appraisal<br/>压缩复杂情境为可判定状态信号]]:::fn

    AC[AppraisedContext<br/>userIntent: string or null<br/>emotionalLoad: low / medium / high<br/>vulnerability: low / medium / high<br/>needsComfort: boolean<br/>needsReflection: boolean<br/>readyForProgress: boolean<br/>abnormalityCandidate: 0 to 3<br/>relationalTemperature: cold / neutral / warm]:::data

    subgraph GINPUT["Protective Evaluator 额外输入"]
        direction LR
        PL[prevProtectiveLevel]:::data
        RCGA[canGuardWhenAbnormal<br/>from soulConfig relationship]:::data
        SIG[/语言 · 情绪 · 基线偏移信号/]:::ext
    end

    PE[[④ Protective Evaluator<br/>判定是否需要守护升级]]:::fn

    PD[ProtectiveDecision<br/>level: 0 / 1 / 2 / 3<br/>activateProtectiveStance: boolean<br/>shouldReorderDrives: boolean<br/>allowElevatedInitiative: boolean<br/>reasons: string array]:::data

    EXT --> CA --> AC
    AC & GINPUT --> PE --> PD
```

---

## Chart 4: Phase 5–7 Decision Layer — 策略决策三连

`ProtectiveDecision` + `AppraisedContext` 作为共同驱动，串联 Drive Reorder → Stance Selector → Response Planner。

```mermaid
flowchart TD
    classDef data fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,font-weight:bold
    classDef fn fill:#ecfdf5,stroke:#16a34a,color:#166534,font-weight:bold
    classDef shared fill:#ede9fe,stroke:#7c3aed,color:#4c1d95,font-weight:bold

    PD[ProtectiveDecision]:::shared
    AC[AppraisedContext]:::shared

    subgraph STEP5["⑤ Drive Reorder"]
        DRV[soulConfig.drives]:::data
        DR[[Drive Reorder<br/>动态重排 drive 优先级]]:::fn
        EDO[EffectiveDriveOrder<br/>respect · comfort · continuity<br/>protection · progress · connection<br/>protective mode raises protection priority]:::data
        DRV --> DR
        PD --> DR
        AC --> DR
        DR --> EDO
    end

    subgraph STEP6["⑥ Stance Selector"]
        STC[soulConfig.stances]:::data
        STS[[Stance Selector<br/>选出本轮最适合的姿态]]:::fn
        STD[StanceDecision<br/>primary: companion / comforting / playful<br/>reflective / protective / mobilizing<br/>secondary: string or null<br/>blocked: string array]:::data
        STC --> STS
        AC --> STS
        PD --> STS
        EDO --> STS
        STS --> STD
    end

    subgraph STEP7["⑦ Response Planner"]
        SUM[soulSummary]:::data
        RME[relevantMemories]:::data
        RP[[Response Planner<br/>制定本轮回应策略]]:::fn
        RPL[ResponsePlan<br/>goal: stay_present / soothe / clarify<br/>guard / gently_mobilize<br/>toneModifiers: string array<br/>mustAvoid: string array<br/>shouldAskFollowup: boolean<br/>shouldSuggestAction: boolean<br/>shouldTriggerToolPath: boolean]:::data
        SUM --> RP
        AC --> RP
        PD --> RP
        EDO --> RP
        STD --> RP
        RME --> RP
        RP --> RPL
    end
```

---

## Chart 5: Phase 8–9 Gate & Output — 边界闸门 + 最终输出

`ResponsePlan` 经过最后一道边界检查，才能生成三类产物。

```mermaid
flowchart TD
    classDef data fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,font-weight:bold
    classDef fn fill:#ecfdf5,stroke:#16a34a,color:#166534,font-weight:bold
    classDef gate fill:#fef9c3,stroke:#d97706,color:#92400e,font-weight:bold
    classDef ext fill:#fff7ed,stroke:#f97316,color:#7c2d12,font-weight:bold

    RPL[ResponsePlan]:::data
    PD[ProtectiveDecision]:::data
    SS[soulSummary]:::data

    subgraph BOUNDS["soulConfig 边界配置"]
        direction LR
        BD[boundaries]:::data
        REL[relationship]:::data
    end

    APG{⑧ Action Policy Gate<br/>最后一道关系 · 边界闸门<br/>拦截越界行为}:::gate

    APD[ActionPolicyDecision<br/>allowReply: boolean<br/>allowProactiveFollowup: boolean<br/>allowToolSuggestion: boolean<br/>allowToolExecution: boolean<br/>blockedReasons: string array]:::data

    GEN[[⑨ Generator<br/>依据策略生成最终产物]]:::fn

    P[/Prompt Input<br/>人格 + 策略上下文 to LLM/]:::ext
    R[/Reply<br/>本轮自然语言回应/]:::ext
    T[/Tool and Action Plan<br/>工具建议 · 执行 · 延后触发/]:::ext

    BOUNDS & PD & RPL --> APG --> APD
    APD & RPL & SS --> GEN --> P & R & T
```

---

## Chart 6: 完整例子数据流 (Example Walk-through)

用户输入 `"我最近真的有点撑不住了，好像什么都乱掉了。"` — 数据如何流过整个 pipeline。

```mermaid
flowchart TD
    classDef data fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,font-weight:bold
    classDef fn fill:#ecfdf5,stroke:#16a34a,color:#166534,font-weight:bold
    classDef gate fill:#fef9c3,stroke:#d97706,color:#92400e,font-weight:bold
    classDef ext fill:#fff7ed,stroke:#f97316,color:#7c2d12,font-weight:bold
    classDef trigger fill:#fff7ed,stroke:#f97316,color:#7c2d12,font-style:italic

    TRIGGER[/用户输入<br/>我最近真的有点撑不住了<br/>好像什么都乱掉了。/]:::trigger

    SC[soulConfig<br/>温柔陪伴者 · 中等主动<br/>默认克制 · 异常时可守护]:::data
    SB[[① Soul Summary Builder]]:::fn
    SS[soulSummary<br/>默认先接住，不说教<br/>不压迫用户<br/>必要时进入守护]:::data

    CA[[② Context Appraisal]]:::fn
    AC[AppraisedContext<br/>emotionalLoad = high<br/>needsComfort = true<br/>needsReflection = true<br/>abnormalityCandidate = 2]:::data

    PE[[③ Protective Evaluator]]:::fn
    PD[ProtectiveDecision<br/>level = 2<br/>activateProtectiveStance = true<br/>shouldReorderDrives = true]:::data

    DR[[④ Drive Reorder]]:::fn
    EDO[EffectiveDriveOrder<br/>respect > protection > comfort<br/>continuity > progress > connection]:::data

    STS[[⑤ Stance Selector]]:::fn
    STD[StanceDecision<br/>primary = protective<br/>secondary = comforting]:::data

    RP[[⑥ Response Planner]]:::fn
    RPL[ResponsePlan<br/>goal = guard<br/>shouldAskFollowup = true<br/>shouldSuggestAction = true<br/>shouldTriggerToolPath = false]:::data

    APG{⑦ Action Policy Gate}:::gate
    APD[ActionPolicyDecision<br/>allowReply yes<br/>allowProactiveFollowup yes<br/>allowToolExecution no]:::data

    GEN[[⑧ Generator]]:::fn
    OUT[/温柔守护式回应<br/>加一个 follow-up 问句/]:::ext

    SC --> SB --> SS
    TRIGGER --> CA
    SS -.->|人格底色| CA
    CA --> AC
    AC --> PE --> PD
    PD --> DR --> EDO
    EDO --> STS --> STD
    STD & SS --> RP --> RPL
    RPL & PD --> APG --> APD
    APD & SS --> GEN --> OUT
```
