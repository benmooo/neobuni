---
title: "Chat Turn Runtime Pipeline — Canonical Runtime Diagram"
---

# Chat Turn Runtime Pipeline — Canonical Runtime Diagram

> 配套文档：
>
> - [ARCHITECTURE.md](../../../ARCHITECTURE.md)
> - [runtime-kernel-implementation-plan.md](../../runtime-kernel-implementation-plan.md)
> - [soul-runtime-observability.md](../soul-runtime-observability.md)

---

## 图例 Legend

|  形状   | 含义                                            | 用法                                         |
| :-----: | ----------------------------------------------- | -------------------------------------------- |
| `[/ /]` | 外部输入 / 输出边界                             | `POST /chat/stream`、`SSE chunks`            |
|  `[ ]`  | Runtime shell stage / runtime span              | `request_received`、`prompt_compile`         |
| `[[ ]]` | 纯函数 / pure composition                       | `planTurnRetrieval`、`runTurnKernel`         |
|  `{ }`  | 分支 / gate / final status split                | `pre-recall?`、`provider outcome?`           |
| `[( )]` | Store / DB / Provider / Tool / side effect edge | `messages`、`temporal store`、`chat adapter` |
| `(( ))` | side-channel / background task / timeout signal | `queueAutoDigestCheck`、`idle timeout`       |

说明：

- 这份图以当前代码为准，而不是只按架构草案抽象命名
- `apps/server/src/runtime/create-chat-turn-stream.ts` 是当前 canonical orchestration shell
- `packages/core/src/runtime/*` 是纯 runtime kernel；store recall、provider stream、tool execution、persistence 仍留在 server shell

---

## Chart 1: End-to-End Canonical Turn Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '14px', 'lineColor': '#94a3b8'}}}%%
flowchart TB
    classDef ext fill:#fff7ed,stroke:#f97316,color:#7c2d12,font-weight:bold
    classDef stage fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,font-weight:bold
    classDef fn fill:#ecfdf5,stroke:#16a34a,color:#166534,font-weight:bold
    classDef gate fill:#fef3c7,stroke:#d97706,color:#92400e,font-weight:bold
    classDef store fill:#f5f3ff,stroke:#7c3aed,color:#5b21b6,font-weight:bold
    classDef event fill:#f8fafc,stroke:#64748b,color:#334155,font-weight:bold

    subgraph ENTRY["Entry Boundary"]
        REQ[/POST /api/v1/chat/stream/]:::ext
        ROUTE[apps/server/src/routes/chat.ts<br/>validate request<br/>load conversation<br/>extract latestUserText<br/>wire AbortController]:::stage
    end

    subgraph SHELL["Imperative Shell — apps/server/src/runtime/create-chat-turn-stream.ts"]
        OBS[createRuntimeObserver<br/>createRuntimeTurn]:::stage
        RR[request_received]:::stage
        UMP[user_message_persist]:::stage
        LCTX[turn_context_load<br/>loadTurnContext]:::stage
        SN[signal_normalization<br/>summarizeSignalSet]:::stage
        RET[runRetrieval<br/>server recall orchestration]:::stage
        KERNEL[[runTurnKernel]]:::fn
        KF[evidence_fusion<br/>working_memory_build<br/>soul_decision<br/>response_spec_build<br/>prompt_compile]:::stage
        PSET[buildProviderRequestInput<br/>createRuntimeMiddleware<br/>buildProviderChatOptions]:::stage
        PSTREAM[provider_stream]:::stage
        AP[assistant_message_persist]:::stage
        TF[turn_finalize]:::stage
    end

    subgraph CTX["Context Load — loadTurnContext"]
        LOADS[(agentConfig<br/>providerConfig<br/>soulConfig<br/>profile<br/>schedules<br/>messages<br/>unresolved memories<br/>recent memories<br/>memory configs<br/>recent runtime turns)]:::store
        BSS[[buildSignalSet]]:::fn
        BTC[[buildTurnContext]]:::fn
        TC[TurnContext]:::stage
    end

    subgraph RETR["Retrieval — shell + pure planner"]
        PTR[[planTurnRetrieval]]:::fn
        RSIG[retrieval_signals]:::stage
        PLAN[RetrievalPlan<br/>intentProfile<br/>activation<br/>queries]:::stage
        PRQ{temporal_recall?}:::gate
        GRQ{graph_recall?}:::gate
        KRQ{knowledge_recall?}:::gate
        PAR((parallel prefetch)):::event
        TM[(temporal-memory-store)]:::store
        GM[(graph-memory-store)]:::store
        KM[(knowledge-store)]:::store
        RE[RetrievedEvidence]:::stage
    end

    subgraph SIDE["Side Effects and Observability"]
        PERSIST[(runtime_turns<br/>runtime_spans<br/>messages)]:::store
        DIGEST((queueAutoDigestCheck)):::event
        TOOLS[(tool runtime<br/>createChatToolSet)]:::store
    end

    subgraph EXIT["Client Boundary"]
        SSE[/SSE chunks to client/]:::ext
        DONE[/turn persisted and finalized/]:::ext
    end

    REQ --> ROUTE --> OBS --> RR --> UMP --> LCTX --> SN --> RET --> KERNEL --> KF --> PSET --> PSTREAM --> AP --> TF --> DONE

    OBS -.-> PERSIST
    RR -.-> PERSIST
    UMP --> PERSIST
    AP --> PERSIST
    TF --> PERSIST

    LCTX --> LOADS --> BSS --> BTC --> TC
    TC --> SN
    TC --> PTR --> RSIG --> PLAN
    PLAN --> PRQ
    PLAN --> GRQ
    PLAN --> KRQ
    PRQ -->|enabled| TM
    GRQ -->|graphQuery present| GM
    KRQ -->|knowledgeQuery present| KM
    TM --> RE
    GM --> RE
    KM --> RE
    PLAN -.-> PAR
    RE --> KERNEL
    TC --> KERNEL
    LOADS --> KERNEL

    KF -.-> PERSIST
    KF -.-> DIGEST
    PSET --> TOOLS
    PSTREAM <--> TOOLS
    PSTREAM -.-> PERSIST
    PSTREAM --> SSE
```

---

## Chart 2: `runTurnKernel` Expansion

这张图把 `packages/core/src/runtime/run-turn-kernel.ts` 展开，强调当前 runtime kernel 里哪些步骤已经是纯函数组合。

```mermaid
flowchart LR
    classDef ext fill:#fff7ed,stroke:#f97316,color:#7c2d12,font-weight:bold
    classDef data fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,font-weight:bold
    classDef fn fill:#ecfdf5,stroke:#16a34a,color:#166534,font-weight:bold

    TC[TurnContext]:::data
    RE[RetrievedEvidence]:::data
    SC[SoulConfig]:::data
    AC[AgentConfig]:::data

    MF[[buildMemoryFusionResult]]:::fn
    TE[TemporalEvidence]:::data
    FE[FusedEvidence]:::data
    WM[WorkingMemory]:::data

    SD[[buildSoulDecision]]:::fn
    SR[SoulRuntime]:::data
    RS[ResponseSpec]:::data

    SS[[summarizeSignalSet]]:::fn
    TCTX[TextExpressionContext]:::data
    DRV[ExpressionSignalDrivers]:::data

    EX[[compileExpressionSet]]:::fn
    ES[ExpressionSet]:::data
    REN[[buildRendererState]]:::fn
    RND[RendererState]:::data

    PP[[compilePromptPacket]]:::fn
    PK[PromptPacket]:::data
    SP[/systemPrompt/]:::ext

    RE --> MF
    TC --> MF
    MF --> TE
    MF --> FE
    MF --> WM

    TC --> SD
    RE --> SD
    SC --> SD
    SD --> SR
    SD --> RS

    TC --> SS --> DRV
    WM --> TCTX
    SR --> TCTX
    RS --> EX
    TCTX --> EX
    DRV --> EX
    EX --> ES --> REN --> RND

    AC --> PP
    RE --> PP
    WM --> PP
    SR --> PP
    ES --> PP
    PP --> PK --> SP
```

---

## Chart 3: Provider Stream, Tool Hooks, and Finalization

这张图展开 `provider_stream` 之后的生命周期，因为这一段是当前 turn shell 里最厚的一层。

```mermaid
flowchart TB
    classDef ext fill:#fff7ed,stroke:#f97316,color:#7c2d12,font-weight:bold
    classDef stage fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,font-weight:bold
    classDef gate fill:#fef3c7,stroke:#d97706,color:#92400e,font-weight:bold
    classDef store fill:#f5f3ff,stroke:#7c3aed,color:#5b21b6,font-weight:bold
    classDef event fill:#f8fafc,stroke:#64748b,color:#334155,font-weight:bold

    PREP[provider request input<br/>chat options<br/>runtime middleware]:::stage
    CHAT[(chat adapter and provider stream)]:::store
    ONSTART[onStart<br/>open provider_stream span]:::stage
    CHUNK{chunk type?}:::gate
    TEXT[append assistantText<br/>recordProviderTextContribution]:::stage
    TOOLS[onBeforeToolCall<br/>onAfterToolCall<br/>onToolPhaseComplete]:::stage
    TOOLSPAN[tool_call span open or close]:::stage
    FINISH[onFinish or onAbort or onError<br/>classifyProviderStreamOutcome]:::stage
    RESOLVE[resolveTurnFromProviderOutcome]:::stage
    STATUS{provider turn status?}:::gate
    HASMSG{assistantText.trim() present?}:::gate
    AP[assistant_message_persist]:::stage
    SKIP[skip assistant_message_persist]:::stage
    FINAL[turn_finalize]:::stage
    TIMEOUT((idle timeout or abort signal)):::event
    SSE[/yield SSE chunks/]:::ext
    STORE[(runtime_spans<br/>runtime_turns<br/>messages)]:::store

    PREP --> CHAT --> ONSTART --> CHUNK
    CHUNK -->|TEXT_MESSAGE_CONTENT| TEXT --> SSE --> CHUNK
    CHUNK -->|tool activity| TOOLS --> TOOLSPAN --> CHUNK
    CHUNK -->|stream completed| FINISH --> RESOLVE --> STATUS

    TIMEOUT -.-> STATUS
    STATUS -->|aborted| FINAL
    STATUS -->|failed| FINAL
    STATUS -->|completed| HASMSG
    HASMSG -->|yes| AP --> FINAL
    HASMSG -->|no| SKIP --> FINAL

    ONSTART -.-> STORE
    TOOLSPAN -.-> STORE
    FINISH -.-> STORE
    AP --> STORE
    SKIP -.-> STORE
    FINAL --> STORE
```

---

## Code Anchors

- Canonical route entry: `apps/server/src/routes/chat.ts`
- Canonical turn shell: `apps/server/src/runtime/create-chat-turn-stream.ts`
- Context loading: `apps/server/src/runtime/load-turn-context.ts`
- Retrieval orchestration: `apps/server/src/runtime/run-retrieval.ts`
- Runtime observer and span persistence: `apps/server/src/runtime/runtime-observer.ts`
- Pure retrieval planning: `packages/core/src/runtime/plan-turn-retrieval.ts`
- Pure runtime kernel: `packages/core/src/runtime/run-turn-kernel.ts`
- Turn contracts and stage enum: `packages/contracts/src/runtime/turn.ts`, `packages/contracts/src/runtime/turn-context.ts`

## Notes

- 当前代码真实发出的主 span 顺序是：`request_received` -> `user_message_persist` -> `turn_context_load` -> `signal_normalization` -> `retrieval_signals` -> `retrieval_plan` -> `temporal_recall?` -> `graph_recall?` -> `knowledge_recall?` -> `evidence_fusion` -> `working_memory_build` -> `soul_decision` -> `response_spec_build` -> `prompt_compile` -> `provider_stream` -> `tool_call*` -> `assistant_message_persist?` -> `turn_finalize`
- `temporal_recall`、`graph_recall`、`knowledge_recall` 现在按统一 `RetrievalPlan` 独立启动，逻辑上是并行 prefetch，不再通过执行顺序暗示数据依赖
- `runtimeStageSchema` 已切到新 retrieval stage 命名；`soul_runtime` 和 `prompt_build` 仍是尚未在 canonical path 发出的历史 stage
- `queueAutoDigestCheck()` 是在 prompt compile 之后异步排队的 side-channel，不阻塞本轮 provider stream
