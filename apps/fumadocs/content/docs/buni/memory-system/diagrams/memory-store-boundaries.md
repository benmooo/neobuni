---
title: "Memory Store Boundaries — 三层记忆边界图"
---

# Memory Store Boundaries — 三层记忆边界图

> 配套文档：[memory-system-v2.md](../memory-system-v2.md)

---

## 图例 Legend

|  形状   | 含义                | 用法                                 |
| :-----: | ------------------- | ------------------------------------ |
| `[/ /]` | 外部输入 / 外部产物 | messages、documents、evidence output |
|  `[ ]`  | 数据 / 中间契约     | `ProjectableMemory`、`GraphQuery`    |
| `[[ ]]` | 变换 / 提取函数     | digest、projection、ingest、search   |
| `[( )]` | Store / Index / DB  | tables、vec、fts                     |

---

## Chart 1: Write Path — Digest / Projection / Ingest

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '14px', 'lineColor': '#94a3b8'}}}%%
flowchart LR
    classDef ext fill:#fff7ed,stroke:#f97316,color:#7c2d12,font-weight:bold
    classDef data fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,font-weight:bold
    classDef fn fill:#ecfdf5,stroke:#16a34a,color:#166534,font-weight:bold
    classDef store fill:#f5f3ff,stroke:#7c3aed,color:#5b21b6,font-weight:bold

    MSG[/conversation messages/]:::ext
    DIG[[digest / memory extraction]]:::fn
    MEM[structured memories]:::data

    TWRITE[[embed + store temporal memory]]:::fn
    GPROJ[[project memory to graph]]:::fn

    DOC[/knowledge document input/]:::ext
    KING[[knowledge ingest]]:::fn
    KART[chunks + facts]:::data

    TSTORE[(memories + vec_memories)]:::store
    GSTORE[(memory_graph_nodes<br/>memory_graph_edges<br/>memory_graph_sources)]:::store
    KSTORE[(knowledge_documents<br/>knowledge_chunks<br/>knowledge_facts<br/>vec + fts)]:::store

    MSG --> DIG --> MEM
    MEM --> TWRITE --> TSTORE
    MEM --> GPROJ --> GSTORE

    DOC --> KING --> KART --> KSTORE
```

---

## Chart 2: Read Path — Three Parallel Recall Stores

```mermaid
flowchart LR
    classDef data fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,font-weight:bold
    classDef fn fill:#ecfdf5,stroke:#16a34a,color:#166534,font-weight:bold
    classDef store fill:#f5f3ff,stroke:#7c3aed,color:#5b21b6,font-weight:bold
    classDef ext fill:#fff7ed,stroke:#f97316,color:#7c2d12,font-weight:bold

    PLAN[RetrievalPlan]:::data

    TSTORE[(Temporal Cortex)]:::store
    GSTORE[(Hippocampus)]:::store
    KSTORE[(World Knowledge)]:::store

    TREC[[temporal recall]]:::fn
    GREC[[graph recall]]:::fn
    KREC[[knowledge recall]]:::fn

    TOUT[/RecalledMemory Array/]:::ext
    GOUT[/EvidenceItem Array from graph/]:::ext
    KOUT[/EvidenceItem Array from knowledge/]:::ext

    PLAN --> TREC
    PLAN --> GREC
    PLAN --> KREC

    TSTORE --> TREC --> TOUT
    GSTORE --> GREC --> GOUT
    KSTORE --> KREC --> KOUT
```

---

## Chart 3: Hippocampus Internal Shape

```mermaid
flowchart TD
    classDef ext fill:#fff7ed,stroke:#f97316,color:#7c2d12,font-weight:bold
    classDef data fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,font-weight:bold
    classDef fn fill:#ecfdf5,stroke:#16a34a,color:#166534,font-weight:bold
    classDef store fill:#f5f3ff,stroke:#7c3aed,color:#5b21b6,font-weight:bold

    MEM[ProjectableMemory]:::data
    PROJ[[projectMemoryToGraph]]:::fn

    NODES[(memory_graph_nodes)]:::store
    EDGES[(memory_graph_edges)]:::store
    SOURCES[(memory_graph_sources)]:::store

    GQ[graphQuery.seedTerms]:::data
    SEARCH[[searchMemoryGraphNodes]]:::fn
    WALK[[list edges + neighbors]]:::fn
    MAP[[map graph results to evidence item array]]:::fn
    EVID[/Graph EvidenceItem Array/]:::ext

    MEM --> PROJ
    PROJ --> NODES
    PROJ --> EDGES
    PROJ --> SOURCES

    GQ --> SEARCH
    NODES --> SEARCH --> WALK
    EDGES --> WALK
    NODES --> WALK
    SOURCES --> MAP
    WALK --> MAP --> EVID
```

---

## Chart 4: World Knowledge Internal Shape

```mermaid
flowchart TD
    classDef ext fill:#fff7ed,stroke:#f97316,color:#7c2d12,font-weight:bold
    classDef data fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,font-weight:bold
    classDef fn fill:#ecfdf5,stroke:#16a34a,color:#166534,font-weight:bold
    classDef store fill:#f5f3ff,stroke:#7c3aed,color:#5b21b6,font-weight:bold

    DOC[/knowledge document/]:::ext
    ING[[knowledge ingest service]]:::fn

    DOCS[(knowledge_documents)]:::store
    CHUNKS[(knowledge_chunks<br/>vec_knowledge_chunks<br/>fts_knowledge_chunks)]:::store
    FACTS[(knowledge_facts)]:::store

    KQ[knowledgeQuery]:::data
    FT[[keyword / fallback text search]]:::fn
    VS[[vector search]]:::fn
    FS[[fact search]]:::fn
    MERGE[[hybrid merge to evidence item array]]:::fn
    OUT[/Knowledge EvidenceItem Array/]:::ext

    DOC --> ING --> DOCS
    ING --> CHUNKS
    ING --> FACTS

    KQ --> FT
    KQ --> VS
    KQ --> FS
    CHUNKS --> FT
    CHUNKS --> VS
    FACTS --> FS
    FT --> MERGE
    VS --> MERGE
    FS --> MERGE --> OUT
```
