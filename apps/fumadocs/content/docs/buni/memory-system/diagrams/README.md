---
title: "Memory System Diagrams"
---

# Memory System Diagrams

> 配套文档：
> [current-memory-system-qa.md](../current-memory-system-qa.md)
> · [memory-system-v2.md](../memory-system-v2.md)

---

## 0. 说明

这组图只描述当前 memory system 的工程实现与分层关系。

绘图原则：

- 数据节点和函数节点严格区分
- store / DB 视为 IO 边界，不混进 pure core
- gate / planner / fusion / working memory 都按函数式阶段展开
- runtime 一律用 `subgraph / lane` 表达，不再画成单节点
- 形状优先于颜色，确保黑白打印仍可读
- 每张图只解决一个问题，不把所有信息塞进一张总图

---

## 1. 图列表

- [memory-system-overview.md](./memory-system-overview.md)
  - 从 user input 到 working memory 的全链路总览
- [memory-retrieval-pipeline-dataflow.md](./memory-retrieval-pipeline-dataflow.md)
  - `memory gate -> recall query -> retrieval plan -> store recall` 的细化数据流
- [memory-store-boundaries.md](./memory-store-boundaries.md)
  - `Temporal Cortex / Hippocampus / World Knowledge` 的写入与读取边界
- [evidence-fusion-working-memory.md](./evidence-fusion-working-memory.md)
  - `EvidenceItem` 如何融合，以及如何构建 `WorkingMemory`
