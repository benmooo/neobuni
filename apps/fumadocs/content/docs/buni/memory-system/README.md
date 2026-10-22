---
title: "Memory System Docs"
---

# Memory System Docs

> 版本：1.0  
> 日期：2026-05-01

---

## 0. 说明

这个目录收拢 Buni 当前 memory system 的设计文档。

按用途分成两类：

- **当前实现导向**
  - 用来回答“现在系统到底怎么工作”
- **演进与历史设计**
  - 用来回答“为什么会这么设计，以及之前方案是什么”

---

## 1. 当前实现导向

- [current-memory-system-qa.md](./current-memory-system-qa.md)
  - 面向工程问答
  - 解释 `memory gate`、`retrieval plan`、`temporal cortex`、`hippocampus`、`world knowledge`、`evidence fusion`、`working memory`

---

## 2. 演进与历史设计

- [memory-system-v2.md](./memory-system-v2.md)
  - 多层记忆系统总体设计
- [memory-recall-redesign.md](./memory-recall-redesign.md)
  - recall 路径从 LLM router 到 cheap gate 的重构思路
- [memories-implementation.md](./memories-implementation.md)
  - 更早期的记忆系统迁移与实现方案
  - 其中部分 provider transport 假设已被 `docs/platform/provider-protocol-first-runtime.md` 覆盖
- [chat-writable-memory-tools-research.md](./chat-writable-memory-tools-research.md)
  - chat 直接写 memory 的方案研究与选型
- [chat-writable-memory-tools-system-design.md](./chat-writable-memory-tools-system-design.md)
  - `save_memory / update_memory / resolve_memory_conflict / mark_task_done` 的系统设计

---

## 3. 图示

- [diagrams/README.md](./diagrams/README.md)
  - memory system 的分层 mermaid 图总索引
- [diagrams/memory-system-overview.md](./diagrams/memory-system-overview.md)
  - 总览图
- [diagrams/memory-retrieval-pipeline-dataflow.md](./diagrams/memory-retrieval-pipeline-dataflow.md)
  - retrieval pipeline 细化数据流图
- [diagrams/memory-store-boundaries.md](./diagrams/memory-store-boundaries.md)
  - temporal / graph / knowledge 三层存储与读写边界
- [diagrams/evidence-fusion-working-memory.md](./diagrams/evidence-fusion-working-memory.md)
  - evidence fusion 与 working memory build

---

## 4. 阅读顺序

如果你想先理解现在系统，建议按这个顺序看：

1. [current-memory-system-qa.md](./current-memory-system-qa.md)
2. [diagrams/memory-system-overview.md](./diagrams/memory-system-overview.md)
3. [diagrams/memory-retrieval-pipeline-dataflow.md](./diagrams/memory-retrieval-pipeline-dataflow.md)
4. [diagrams/evidence-fusion-working-memory.md](./diagrams/evidence-fusion-working-memory.md)
5. [memory-system-v2.md](./memory-system-v2.md)
6. [memory-recall-redesign.md](./memory-recall-redesign.md)
7. [chat-writable-memory-tools-research.md](./chat-writable-memory-tools-research.md)
8. [chat-writable-memory-tools-system-design.md](./chat-writable-memory-tools-system-design.md)

如果你想看更早期的迁移背景，再补：

9. [memories-implementation.md](./memories-implementation.md)

如果你关心 provider / transport 方向，先看：

10. [../platform/provider-protocol-first-runtime.md](../platform/provider-protocol-first-runtime.md)
