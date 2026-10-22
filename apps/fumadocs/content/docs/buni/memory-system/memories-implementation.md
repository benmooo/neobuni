---
title: "Buni 记忆系统迁移与实现方案"
---

# Buni 记忆系统迁移与实现方案

> Note
>
> This document is still useful for memory capability decomposition, but its older transport assumptions are partially superseded by `docs/platform/provider-protocol-first-runtime.md`.
>
> In particular:
>
> - chat and tool-enabled DeepSeek reasoning should not be modeled as a permanent OpenAI-compatible patch path
> - provider config should separate capability, protocol, and vendor
> - provider-private transcript compatibility is not a long-term runtime goal

## 1. 背景

当前 Buni 记忆系统已经具备基础闭环：

- 对话消息可以做 digest，提炼出结构化记忆
- 记忆会写入 `memories` 表
- 记忆向量会写入 `vec_memories`
- 聊天时会做 instant digest，决定是否 recall
- recall 结果会注入 system prompt

但当前实现把三类能力都绑定到了 Gemini：

- embedding
- digest / memory extraction
- recall router

这会带来两个问题：

1. 记忆能力和厂商实现耦合过深，后续替换模型需要改动整条链路。
2. 当前 `memory` provider 配置只能表达一套模型，但新的需求已经是两套能力分离：
   - embedding: `text-embedding-v4`，1024 维
   - digest / router: DeepSeek

因此，这次迁移的核心目标不是“把 Gemini 文本替换成 Qwen / DeepSeek 文本”，而是把记忆系统改造成按能力拆分的结构。

---

## 2. 本次确认的目标

### 2.1 已确认决策

- embedding 模型：`text-embedding-v4`
- embedding 维度：`1024`
- recall 侧 LLM：DeepSeek
- DeepSeek 只负责：
  - digest / memory extraction
  - instant recall router
- DeepSeek 暂时不负责：
  - recall top-k rerank
  - 最终记忆筛选裁决
- 模型调用不再统一假设为 OpenAI-compatible；transport 必须按 capability 和 protocol 明确建模
- 清理 Gemini 专用服务和 Gemini 专用配置入口

### 2.2 非目标

本次不做以下内容：

- 多模态记忆向量
- 图片 / 音频 / 文件 embedding
- DeepSeek rerank
- 多 provider ensemble recall
- 记忆去重 / 合并的自动后台任务
- 线上兼容保留 Gemini 回退逻辑

---

## 3. 设计原则

### 3.1 Functional Core, Imperative Shell

继续保持现有工程原则：

- `packages/core` 放纯函数和评分逻辑
- `apps/server/src/ai` 放模型调用和 IO
- `packages/db` 放持久化

迁移时不要把模型调用逻辑散落到 route 或 orchestration 层。

### 3.2 能力拆分优先于厂商拆分

记忆系统应该按能力建模，而不是按厂商建模。

建议拆成两类能力：

- `memory_embedding`
- `memory_reasoning`

其中：

- `memory_embedding` 只负责 `embed memory` / `embed query`
- `memory_reasoning` 负责：
  - `extractMemories`
  - `runInstantDigestLLM`

这样以后再切模型，只需要替换能力实现，不需要重写整条记忆链路。

### 3.3 保留当前 recall 主流程

本次不重写 recall 算法，继续沿用当前稳定路径：

1. query embedding
2. sqlite-vec KNN 检索
3. `vector + keyword + importance` 评分
4. unresolved / recent 三层筛选
5. system prompt 注入

DeepSeek 这次只负责“是否查记忆”和“如何提炼记忆”，不负责最终排序。

这样迁移成本最低，行为也最容易预期。

---

## 4. 当前实现现状

### 4.1 现有耦合点

当前几个核心文件存在明显 Gemini 耦合：

- `apps/server/src/ai/gemini-service.ts`
  - 同时做 embedding、digest extract、instant router
- `apps/server/src/ai/embedding-service.ts`
  - 直接依赖 `GeminiConfig`
- `apps/server/src/ai/recall-pipeline.ts`
  - 直接依赖 `GeminiConfig`
- `apps/server/src/ai/digest-pipeline.ts`
  - 直接依赖 `GeminiConfig`
- `apps/server/src/routes/memories.ts`
  - 配置读取写死为 Gemini
- `apps/server/src/routes/config.ts`
  - 暴露 `/provider/gemini`
- `apps/mobile/src/routes/_app.settings.tsx`
  - 设置页是 Gemini 专区

### 4.2 当前配置模型的问题

当前 `provider_configs` 表只有一个 `slot` 字段，现有语义基本是：

- `chat`
- `memory`

这个设计在 Gemini 单模型阶段可用，但无法表达：

- `memory_embedding` 和 `memory_reasoning` 分别配置
- 两个能力使用不同 provider / model / key / baseUrl

因此，配置模型本身需要升级。

### 4.3 当前向量数据的问题

当前 `vec_memories` 虚拟表固定为：

```sql
FLOAT[768]
```

而目标 embedding 维度是 `1024`。

这意味着：

- 旧的 Gemini 向量不能继续复用
- 不能和新的 `text-embedding-v4` 向量混存
- 必须重建 `vec_memories`

这不是可选项，是迁移的硬约束。

---

## 5. 目标架构

### 5.1 逻辑架构

```text
聊天消息 / 手动 digest 请求
  └── memory_reasoning
      ├── extractMemories(messages)
      └── runInstantDigest(userMessage)

记忆创建 / 记忆更新 / recall query
  └── memory_embedding
      ├── embedMemory(content)
      └── embedQuery(query)

embedQuery(query)
  └── sqlite-vec KNN
      └── core/memory-scoring
          └── core/memory-surfacing
              └── buildSystemPrompt(memories)
```

### 5.2 模型职责

#### `memory_embedding`

- provider: Qwen-compatible OpenAI endpoint
- model: `text-embedding-v4`
- dimension: `1024`
- 用途：
  - 新建记忆时 embedding
  - 编辑记忆内容时 re-embedding
  - recall query embedding
  - 后续全量 reindex

#### `memory_reasoning`

- provider: protocol-first provider profile
- default vendor direction for DeepSeek reasoning: prefer Anthropic protocol where the capability needs tool-enabled or thinking-aware chat semantics; use OpenAI-compatible transport only where the capability genuinely matches that protocol boundary
- model: 待配置
- 用途：
  - conversation digest extraction
  - instant recall router

#### `chat`

- 保持独立
- 不与记忆 provider 混用配置
- 不被本次迁移强绑定

---

## 6. 配置模型重构

### 6.1 新的 slot 设计

建议把 provider slot 扩展为：

- `chat`
- `memory_embedding`
- `memory_reasoning`

不再使用单一的 `memory` slot。

### 6.2 provider kind 设计

建议 provider kind 从当前：

- `mock`
- `openai`
- `gemini`

调整为：

- `mock`
- `openai`
- `deepseek`
- `qwen`

但实现层不再统一走单一 transport。

换句话说：

- `deepseek` 和 `qwen` 是配置语义
- 真正调用要根据 capability 选择合适的 protocol adapter

这样做的好处：

- UI 和配置更清晰
- 后续统计和排障更清晰
- 底层实现不需要为了品牌名复制逻辑

### 6.3 配置项建议

每个 slot 都保留统一结构：

- `provider`
- `model`
- `apiKey`
- `baseUrl`
- `enabled`
- `metadata`

其中：

- `memory_embedding.metadata.dimension = 1024`
- `memory_reasoning.metadata.digestThreshold = 50`

如后续没有更多 embedding 元信息，也可以先不把 `dimension` 持久化到 metadata，而在代码里集中定义常量。  
但从可运维性看，建议 metadata 保留这个字段，避免以后换模型时和 DB schema 维度不一致。

---

## 7. 服务分层重构方案

### 7.1 删除 Gemini 专用服务

当前的 `gemini-service.ts` 应当拆掉，不再保留一个把三类能力揉在一起的服务。

目标是拆成更小、更清晰的服务。

### 7.2 建议新增的服务结构

建议拆成下面这些文件：

#### `apps/server/src/ai/openai-compatible-client.ts`

职责：

- 根据 `{ apiKey, baseUrl }` 创建统一客户端
- 作为底层 transport 层

#### `apps/server/src/ai/memory-embedding-service.ts`

职责：

- `embedText(config, text): Promise<Float32Array>`
- 只面向 `text-embedding-v4`
- 返回 1024 维向量

#### `apps/server/src/ai/memory-reasoning-service.ts`

职责：

- `extractMemories(config, messagesText)`
- `runInstantDigestLLM(config, userMessage)`

#### `apps/server/src/ai/memory-provider-config.ts`

职责：

- 读取 `memory_embedding` 配置
- 读取 `memory_reasoning` 配置
- 统一转换为内部 config 结构

#### `apps/server/src/ai/embedding-service.ts`

保留，但改成只编排：

- `embedAndStoreMemory`
- `embedQueryForSearch`

不再直接依赖 Gemini。

#### `apps/server/src/ai/digest-pipeline.ts`

保留，但改成依赖：

- `memory_reasoning`
- `memory_embedding`

#### `apps/server/src/ai/recall-pipeline.ts`

保留，但只依赖：

- `memory_embedding`

不依赖 `memory_reasoning`。

---

## 8. 记忆链路的目标行为

### 8.1 手动 / 自动 digest

流程：

1. 读取 digest anchor
2. 取未处理消息
3. 按批格式化消息文本
4. 用 DeepSeek 做 `extractMemories`
5. 逐条写入 `memories`
6. 用 `text-embedding-v4` 生成向量
7. upsert 到 `vec_memories`
8. 更新 digest anchor

### 8.2 即时 recall

流程：

1. 用户发送新消息
2. 用 DeepSeek 执行 `runInstantDigestLLM`
3. 若 `shouldRecall = false`，直接跳过
4. 若 `shouldRecall = true`：
   - 用 `text-embedding-v4` 生成 query embedding
   - sqlite-vec 检索候选
   - 用现有纯函数打分和筛选
   - 注入 system prompt

### 8.3 记忆手工 CRUD

流程：

- `POST /v1/memories`
  - 写入 memory
  - 自动 embedding
- `PATCH /v1/memories/:id`
  - 若 `content` 改变，则重新 embedding
- `DELETE /v1/memories/:id`
  - 删除 memory
  - 删除对应 vector row

---

## 9. 数据迁移方案

### 9.1 为什么必须重建向量

因为新旧向量同时发生了两类变化：

- embedding 模型变化
- 向量维度从 `768` 变成 `1024`

所以不能沿用旧表，也不能做局部兼容。

### 9.2 推荐迁移策略

采用最简单正确的策略：

1. 修改 `vec_memories` schema 为 `FLOAT[1024]`
2. 清空旧的 `vec_memories`
3. 基于 `memories.content` 全量 re-embed
4. reindex 完成后恢复完整 recall

### 9.3 reindex 期间的系统行为

迁移过程中，recall 可能出现短暂降级。

建议行为：

- 若 embedding 配置缺失，直接跳过 recall
- 若向量表为空，返回空 candidate
- system prompt 仍可注入：
  - unresolved memories
  - recent memories

也就是说，reindex 期间允许 recall 降级，但不应让聊天链路报错。

### 9.4 reindex 任务设计

建议增加一个显式 reindex 能力，而不是完全隐式完成。

可选方式：

- 方式 A：提供内部脚本 / 管理命令
- 方式 B：提供管理接口 `POST /v1/memories/reindex`

一期建议先做方式 A，复杂度最低。

reindex 流程：

1. 扫描所有 memories
2. 分批读取内容
3. 调 embedding 接口
4. upsert 向量
5. 记录成功 / 失败计数
6. 输出 summary

---

## 10. API 与前端配置页调整

### 10.1 服务端配置 API

当前：

- `GET /v1/config/provider`
- `PUT /v1/config/provider`
- `GET /v1/config/provider/gemini`
- `PUT /v1/config/provider/gemini`

目标：

- `GET /v1/config/provider`
- `PUT /v1/config/provider`
- `GET /v1/config/provider/memory-embedding`
- `PUT /v1/config/provider/memory-embedding`
- `GET /v1/config/provider/memory-reasoning`
- `PUT /v1/config/provider/memory-reasoning`

不再暴露 `/provider/gemini`。

### 10.2 移动端设置页

当前是单独的 Gemini 区块。

建议拆成两个区块：

#### Memory Embedding

- Provider
- Model
- API Key
- Base URL
- Enabled
- 维度说明：1024

#### Memory Reasoning

- Provider
- Model
- API Key
- Base URL
- Enabled
- digestThreshold

### 10.3 文案建议

避免再出现 “Gemini（记忆系统）” 这种厂商绑定文案，改成能力导向文案：

- `记忆向量化`
- `记忆理解与路由`

---

## 11. 代码级实施计划

### Phase 1: 能力解耦

目标：

- 删除 `GeminiConfig` 对上层的渗透
- 让 `embedding-service`、`digest-pipeline`、`recall-pipeline` 只依赖能力接口

交付：

- 拆分新的 config type
- 新增 OpenAI-compatible client 封装
- gemini-service 下线

### Phase 2: 配置模型升级

目标：

- slot 从 `memory` 升级为 `memory_embedding` / `memory_reasoning`
- route 和 settings UI 跟上

交付：

- schema / repo / contract 更新
- `/v1/config/provider/memory-*` 路由
- 移动端设置页改造

### Phase 3: embedding 迁移

目标：

- `vec_memories` 维度升级为 `1024`
- 所有 embedding 调用走 `text-embedding-v4`

交付：

- DB schema 调整
- embedding service 替换
- reindex 流程

### Phase 4: reasoning 迁移

目标：

- digest / instant router 改为 DeepSeek

交付：

- `extractMemories`
- `runInstantDigestLLM`
- prompt 保持兼容现有输出结构

### Phase 5: 清理与验证

目标：

- 清理 Gemini 残留
- 验证迁移链路

交付：

- 删除 Gemini routes / settings / types / dependency
- 更新文档
- 跑通手工验证 checklist

---

## 12. 验证清单

### 12.1 配置

- 能分别保存 `memory_embedding` 和 `memory_reasoning`
- 配置缺失时错误提示清晰
- 设置页不会再出现 Gemini 文案

### 12.2 CRUD

- 创建记忆会自动 embedding
- 更新记忆内容会重新 embedding
- 删除记忆会同步删向量

### 12.3 Digest

- 手动 digest 成功创建记忆
- 自动 digest 在阈值满足时触发
- digest anchor 能正确推进

### 12.4 Recall

- 普通消息不会误触 recall
- 带个人历史语义的消息能触 recall
- recall 结果会进入 system prompt
- recall 在空向量表时不会导致聊天失败

### 12.5 Reindex

- 旧向量清空后可重新生成
- reindex 完成后 recall 恢复
- 失败项能被识别和重跑

---

## 13. 风险与应对

### 13.1 OpenAI-compatible 差异

虽然统一走 OpenAI-compatible，但不同厂商的兼容层仍可能有差异：

- embedding 返回字段差异
- JSON mode 支持差异
- `response_format` 支持差异
- 错误码和限流行为差异

应对：

- 客户端封装只暴露最小必要能力
- 优先使用当前链路真正需要的最小协议面
- 对结构化输出做兜底解析

### 13.2 结构化提取不稳定

DeepSeek 在 digest / router 阶段如果 JSON 输出抖动，会直接影响记忆质量。

应对：

- prompt 保持严格、输出字段少
- schema parse 失败时回退空结果
- 加日志，记录原始响应片段

### 13.3 Reindex 时长

记忆量上来后，全量 reindex 会有耗时。

应对：

- 分批处理
- 支持中断后重跑
- 允许 recall 在重建期间降级

### 13.4 Recall 质量波动

更换 embedding 模型后，KNN 分布和得分阈值可能变化。

应对：

- 先保留现有评分公式
- 迁移后观察实际召回质量
- 再决定是否调整阈值或加 rerank

---

## 14. 未来优化方向

### 14.1 多模态记忆向量

当前只做文本向量。

未来可以扩展：

- 图片描述 embedding
- 语音转写 embedding
- 附件 / 文档摘要 embedding

建议方式：

- 先保持 `memories` 为文本主索引
- 多模态内容先转成标准化文本摘要
- 后续再决定是否增加独立模态向量表

### 14.2 Recall rerank

本次不做 DeepSeek rerank。

未来如果发现 recall 噪声偏高，可以增加：

1. vector top-k 初筛
2. reasoning model 做 relevance rerank
3. 再进入 `surfaceMemories`

注意：

- rerank 要放在小候选集上
- 不应替代向量检索
- 要严格控制延迟和成本

### 14.3 记忆去重与合并

当前 digest 会不断新增记忆，长期可能出现：

- 语义重复
- 轻微表述差异的重复条目
- 已过期但仍 unresolved 的条目

未来可以增加后台整理任务：

- 相似记忆聚类
- 自动 merge
- 标记过期任务型记忆
- 归档低价值记忆

### 14.4 分层记忆

未来可以把记忆按层次管理：

- episodic memory: 事件
- semantic memory: 长期事实 / 偏好
- task memory: 待办 / 未完成事项

这会让 recall 更精准，因为不同层的召回策略可以不同。

### 14.5 个性化评分

当前打分公式是固定权重：

- vectorSimilarity * 0.6
- keywordMatch * 0.3
- importance * 0.1

未来可以按用户行为做个性化：

- 哪类记忆被实际命中过
- 哪类记忆经常被模型使用
- 哪类记忆经常被忽略

再反向调整权重。

### 14.6 记忆生命周期管理

未来可以为记忆增加状态管理：

- active
- archived
- expired
- superseded

这样：

- recall 不必总在全部记忆上做
- 已完成任务型记忆可以退出主召回集
- 过时偏好可以被新偏好覆盖

### 14.7 观测与评估

后续应该补齐记忆系统的观测能力：

- recall 触发率
- recall 命中率
- digest 产出率
- 单条消息平均 recall 延迟
- 向量检索候选数量
- 最终被注入 prompt 的记忆数量

没有观测，很难持续优化。

---

## 15. 最终结论

这次迁移的正确方向不是“把 Gemini 改成 Qwen / DeepSeek”，而是：

1. 把记忆系统从单厂商实现中解耦
2. 把配置模型升级为按能力拆分
3. 用 `text-embedding-v4` 重建整个向量层
4. 用 DeepSeek 接管 digest 和 recall router
5. 保留现有 recall 核心评分与筛选逻辑
6. 清理 Gemini 专用代码和文案

这样改完之后，记忆系统会变成一个更稳定的能力层：

- provider 可替换
- recall 主流程不抖
- 后续可以平滑接入多模态、rerank 和记忆整理任务

这份文档是接下来实现阶段的基准设计，后续代码改动应尽量和这里保持一致。
