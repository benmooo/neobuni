---
title: "Buni SQLite 主库 / 向量库拆分方案"
---

# Buni SQLite 主库 / 向量库拆分方案

## 背景

Buni 当前使用 SQLite 作为主业务数据库，并通过 `sqlite-vec` 的 `vec0` 虚拟表承载记忆向量索引。

这一做法在运行时没有问题，但会直接破坏 `drizzle-kit studio` 的可用性：

- `Drizzle Studio` 使用自己的 `better-sqlite3` 连接读取数据库
- 它不会执行 Buni 运行时中的 `sqlite-vec` 扩展加载逻辑
- 只要主库里存在 `CREATE VIRTUAL TABLE ... USING vec0(...)`，Studio 就会报 `no such module: vec0`

因此，问题不在 Drizzle schema，而在于我们把两类职责不同的数据放进了同一个 SQLite 文件：

- 关系型业务数据
- 依赖扩展的向量索引数据

## 目标

- 让 `Drizzle push / generate / migrate / studio` 只面对纯关系型主库
- 让 `sqlite-vec` 只存在于记忆检索运行时，不侵入 Drizzle 工具链
- 保持当前记忆 embedding / recall / reindex 链路不变
- 为后续向量维度升级、重建、迁移提供更干净的基础设施边界

## 设计决策

### 1. 主库与向量库拆分为两个 SQLite 文件

约定：

- 主库：`buni.sqlite`
- 向量库：`buni-vec.sqlite`

默认放在同一个目录下，例如：

```text
apps/server/data/
  buni.sqlite
  buni-vec.sqlite
```

### 2. Drizzle 只管理主库

Drizzle 的职责只包括：

- schema 定义
- `push / generate / migrate`
- Studio 浏览与调试
- Better Auth 相关表
- Buni 业务关系型表

Drizzle 不再感知：

- `vec_memories`
- `sqlite-vec` 扩展
- 向量维度变更

### 3. 向量库只由运行时初始化

向量库的职责只包括：

- 加载 `sqlite-vec`
- 初始化 `vec_memories`
- 处理向量 upsert / delete / search / clear
- 在 embedding 维度变化时重建虚拟表

也就是说：

- 主库 schema 生命周期由 Drizzle 管
- 向量库 schema 生命周期由运行时的 `ensureVectorSchema()` 管

这是刻意的职责分离。

## 文件路径规则

### 默认路径

运行时默认使用：

- 主库：`apps/server/data/buni.sqlite`
- 向量库：`apps/server/data/buni-vec.sqlite`

### 环境变量

允许覆盖：

- `BUNI_DB_FILE`
- `BUNI_VECTOR_DB_FILE`

兼容已有 Drizzle 约定：

- 如果未显式提供 `BUNI_DB_FILE`，运行时可回退使用 `DRIZZLE_SQLITE_URL`

如果只覆盖主库路径而未覆盖向量库路径，则向量库默认与主库同目录，并使用 `-vec` 后缀派生，例如：

- 主库：`/tmp/dev.sqlite`
- 向量库：`/tmp/dev-vec.sqlite`

## 运行时职责边界

### 主库连接

主库连接负责：

- 开启 `PRAGMA foreign_keys = ON`
- 提供 Drizzle ORM client
- 服务所有关系型 repo

### 向量库连接

向量库连接负责：

- 加载 `sqlite-vec`
- 创建 `vec_memories`
- 服务 `vec-memories` repo

主库与向量库之间不做 SQLite 层 join。

跨两者的协作顺序保持在应用层：

1. 先在主库拿到 memory 记录
2. 再在向量库中做相似度召回
3. 再回主库取完整 memory 实体并完成排序与融合

## 运行流程

### server 启动时

1. 初始化主库连接
2. 初始化向量库连接
3. 尝试加载 `sqlite-vec`
4. 执行 `ensureVectorSchema()`

### 记忆创建 / 更新时

1. 主库写入 `memories`
2. 生成 embedding
3. 向量库写入 `vec_memories`

### 记忆删除时

1. 主库删除 `memories`
2. 向量库删除对应向量行

### reindex 时

1. 主库读取 profile 下全部 memories
2. 清空向量库中的 `vec_memories`
3. 重新生成并写入所有 embedding

## 工具链规则

### `drizzle-kit push`

只更新主库，不创建向量表。

### `drizzle-kit studio`

只连主库，因此不再受到 `vec0` 影响。

### `db:reset`

需要同时删除：

- 主库文件
- 向量库文件

然后只对主库执行 `db:push`。

向量库会在 server 运行时自动重建。

## 开发期迁移说明

如果本地数据库是在旧架构下创建的，那么现有主库文件里可能已经包含：

- `vec_memories`

这意味着即使代码已经切到双文件结构，`drizzle-kit studio` 仍然会继续因为旧主库里的 `vec0` 虚拟表而失败。

开发期的推荐处理方式不是写一次性迁移，而是直接重建：

1. 执行 `bun run db:reset`
2. 重新启动 server，让运行时自动创建 `buni-vec.sqlite`
3. 如有需要，再执行一次记忆 `reindex`

因为当前阶段处于快速迭代期，重建开发库的成本远低于维护一套过渡迁移脚本。

## 为什么不把向量表继续放回主库

因为这会带来三个长期问题：

1. `Drizzle Studio` 无法稳定工作
2. 关系型 schema 管理和扩展型虚拟表管理被强耦合
3. 后续切换 embedding 维度、索引参数、底层向量实现时，主库会被迫承担额外迁移复杂度

拆分后，主库和向量库各自的演化速度可以解耦。

## 非目标

- 当前阶段不把向量索引抽成独立服务
- 当前阶段不引入 pgvector / libsql / 外部向量数据库
- 当前阶段不做多副本或冷热分层

v1 只做本地双 SQLite 文件分层。

## 后续优化方向

### 1. 为向量库增加显式版本元数据

例如保存：

- embedding model
- embedding dimensions
- index created at
- schema version

这样重建策略会更清晰，不必仅靠虚拟表 definition 判断。

### 2. 增加 profile 级或 slot 级向量库分片能力

如果未来记忆量显著增长，可考虑：

- 单文件多 profile
- 多 profile 分片
- 每个 profile 独立向量库

当前不需要提前复杂化。

### 3. 把 reindex 做成后台任务

现在是同步 HTTP 链路，后续可以演进为：

- 任务入队
- 进度事件
- UI 轮询或订阅进度

### 4. 预留多模态向量

当前只支持文本 embedding，后续如果加入图像/音频/混合向量，建议继续沿用“独立向量库”边界，而不是把多模态索引塞回主库。
