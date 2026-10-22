---
title: "Evidence Fusion & Working Memory — 分层图"
---

# Evidence Fusion & Working Memory — 分层图

> 配套文档：[current-memory-system-qa.md](../current-memory-system-qa.md)

---

## 图例 Legend

|  形状   | 含义                               | 用法                                  |
| :-----: | ---------------------------------- | ------------------------------------- |
| `[/ /]` | 最终输出 / runtime-facing artifact | `FusedEvidence`、`WorkingMemory`      |
|  `[ ]`  | 数据 / schema                      | `EvidenceItem`、`taskContext`         |
| `[[ ]]` | 纯函数                             | normalize、fuse、build working memory |

---

## Chart 1: Evidence Fusion

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '14px', 'lineColor': '#94a3b8'}}}%%
flowchart LR
    classDef data fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,font-weight:bold
    classDef fn fill:#ecfdf5,stroke:#16a34a,color:#166534,font-weight:bold
    classDef ext fill:#fff7ed,stroke:#f97316,color:#7c2d12,font-weight:bold

    TM[RecalledMemory Array from temporal]:::data
    GE[EvidenceItem Array from graph]:::data
    KE[EvidenceItem Array from knowledge]:::data

    TMAP[[buildEvidenceItemsFromTemporalMemories]]:::fn
    TE[EvidenceItem Array from temporal]:::data

    FUSE[[fuseEvidenceItems<br/>sort + dedupe]]:::fn
    FE[/FusedEvidence/]:::ext

    TM --> TMAP --> TE
    TE & GE & KE --> FUSE --> FE
```

---

## Chart 2: EvidenceItem Contract Normalization

```mermaid
flowchart TD
    classDef data fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,font-weight:bold
    classDef fn fill:#ecfdf5,stroke:#16a34a,color:#166534,font-weight:bold

    TIN[temporal recalled memory]:::data
    GIN[graph node / relation result]:::data
    KIN[knowledge chunk / fact result]:::data

    TF[[map temporal results to evidence item]]:::fn
    GF[[map graph results to evidence item]]:::fn
    KF[[map knowledge results to evidence item]]:::fn

    EVID[EvidenceItem<br/>store · kind · content · score<br/>retrievalReason · provenance · metadata]:::data

    TIN --> TF --> EVID
    GIN --> GF --> EVID
    KIN --> KF --> EVID
```

---

## Chart 3: Working Memory Build

```mermaid
flowchart TD
    classDef data fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,font-weight:bold
    classDef fn fill:#ecfdf5,stroke:#16a34a,color:#166534,font-weight:bold
    classDef ext fill:#fff7ed,stroke:#f97316,color:#7c2d12,font-weight:bold

    FE[FusedEvidence]:::data
    WM[[buildWorkingMemory]]:::fn

    PI[personalContext]:::data
    RI[relationshipContext]:::data
    TI[taskContext]:::data
    WI[worldContext]:::data
    OL[openLoops]:::data
    UI[userIntent]:::data
    AC[actionCandidates]:::data

    OUT[/WorkingMemory/]:::ext

    FE --> WM
    WM --> PI
    WM --> RI
    WM --> TI
    WM --> WI
    WM --> OL
    WM --> UI
    WM --> AC

    PI & RI & TI & WI & OL & UI & AC --> OUT
```

---

## Chart 4: Bucket Semantics

```mermaid
flowchart LR
    classDef data fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,font-weight:bold
    classDef fn fill:#ecfdf5,stroke:#16a34a,color:#166534,font-weight:bold

    FE[FusedEvidence]:::data

    P[[temporal items except tasks]]:::fn
    R[[graph items or relationship lookup items]]:::fn
    T[[task items]]:::fn
    W[[knowledge items]]:::fn
    O[[unresolved task items to open loops]]:::fn
    U[[derive user intent]]:::fn

    PC[personalContext]:::data
    RC[relationshipContext]:::data
    TC[taskContext]:::data
    WC[worldContext]:::data
    OP[openLoops]:::data
    UI[userIntent<br/>ask / recall / plan]:::data

    FE --> P --> PC
    FE --> R --> RC
    FE --> T --> TC
    FE --> W --> WC
    TC --> O --> OP
    TC --> U
    PC --> U --> UI
```
