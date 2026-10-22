---
title: "Memory Retrieval Pipeline — 函数式数据流图"
---

# Memory Retrieval Pipeline — 函数式数据流图

> 配套文档：[current-memory-system-qa.md](../current-memory-system-qa.md)

---

## 图例 Legend

| 形状 | 含义 | 用法 |
|:----:|------|------|
| `[/ /]` | 外部输入 / 输出 | `latestUserText`、`query` |
| `[ ]` | 数据 / Contract | `MemoryGateDecision`、`MemoryRecallQuery`、`RetrievalPlan` |
| `[[ ]]` | 纯函数 | gate、query builder、planner |
| `{ }` | 决策 / activation | `pre_recall?`、`graph enabled?` |
| `[( )]` | Store / IO | recall stores |
| `(( ))` | Signal / Event | fallback、observability signal |

---

## Chart 1: Gate → Query → Plan

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '14px', 'lineColor': '#94a3b8'}}}%%
flowchart TD
    classDef ext fill:#fff7ed,stroke:#f97316,color:#7c2d12,font-weight:bold
    classDef data fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,font-weight:bold
    classDef fn fill:#ecfdf5,stroke:#16a34a,color:#166534,font-weight:bold
    classDef gate fill:#fef3c7,stroke:#d97706,color:#92400e,font-weight:bold
    classDef event fill:#f8fafc,stroke:#64748b,color:#334155,font-weight:bold

    subgraph INPUT["Gate Inputs"]
        U[/latestUserText/]:::ext
        RU[/recentUserTexts/]:::ext
        UM[/unresolved memory slices/]:::ext
        RM[/recent memory slices/]:::ext
    end

    MG[[buildMemoryGateDecision]]:::fn
    GD[MemoryGateDecision]:::data

    MQ[[buildMemoryRecallQuery]]:::fn
    RQ[MemoryRecallQuery]:::data

    RP[[createRetrievalPlan]]:::fn
    PLAN[RetrievalPlan]:::data
    FALL((tool fallback possible)):::event

    INPUT --> MG --> GD
    INPUT & GD --> MQ --> RQ
    U & GD & RQ --> RP --> PLAN
    GD -.-> FALL
```

---

## Chart 2: Store Activation Logic

```mermaid
flowchart LR
    classDef data fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,font-weight:bold
    classDef gate fill:#fef3c7,stroke:#d97706,color:#92400e,font-weight:bold
    classDef ext fill:#fff7ed,stroke:#f97316,color:#7c2d12,font-weight:bold

    GD[MemoryGateDecision]:::data
    PLAN[RetrievalPlan]:::data

    TPRE{temporal pre-recall enabled?}:::gate
    GON{graph recall requested?}:::gate
    KON{knowledge recall requested?}:::gate

    TYES[/temporal pre-recall/]:::ext
    TFB[/temporal deferred to tool fallback/]:::ext
    TSKIP[/temporal skipped/]:::ext
    GYES[/graph recall executes/]:::ext
    KYES[/knowledge recall executes/]:::ext

    GD --> TPRE
    PLAN --> GON
    PLAN --> KON

    TPRE -->|enabled| TYES
    TPRE -->|tool fallback path| TFB
    TPRE -->|skip path| TSKIP
    GON -->|enabled| GYES
    KON -->|enabled| KYES
```

---

## Chart 3: Detailed Recall Execution

```mermaid
flowchart LR
    classDef ext fill:#fff7ed,stroke:#f97316,color:#7c2d12,font-weight:bold
    classDef data fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,font-weight:bold
    classDef fn fill:#ecfdf5,stroke:#16a34a,color:#166534,font-weight:bold
    classDef store fill:#f5f3ff,stroke:#7c3aed,color:#5b21b6,font-weight:bold

    TQ[temporalQuery]:::data
    GQ[graphQuery]:::data
    KQ[knowledgeQuery]:::data

    TV[(Temporal Cortex)]:::store
    GV[(Hippocampus)]:::store
    KV[(World Knowledge)]:::store

    TR[[recallMemories]]:::fn
    GR[[recallGraphMemory]]:::fn
    KR[[recallKnowledge]]:::fn

    TM[/RecalledMemory Array/]:::ext
    GE[/Graph EvidenceItem Array/]:::ext
    KE[/Knowledge EvidenceItem Array/]:::ext

    TQ --> TR
    GQ --> GR
    KQ --> KR

    TV --> TR --> TM
    GV --> GR --> GE
    KV --> KR --> KE
```
