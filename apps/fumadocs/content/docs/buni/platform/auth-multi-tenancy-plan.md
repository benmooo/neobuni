---
title: "Buni Auth 与多租户迁移方案"
---

# Buni Auth 与多租户迁移方案

## 背景

当前 Buni 的服务端仍然依赖 `DEFAULT_PROFILE_ID = "local"` 作为全局单租户入口。

这意味着：

- 所有请求默认读写同一个 profile
- `profiles` 还没有真实 owner 概念
- 聊天、记忆、设置、日程等数据隔离边界虽然已经以 `profile_id` 建模，但还没有和真实用户身份绑定
- 登录、注册、会话管理尚未进入主链

同时，Buni 的核心人格能力已经从 `aiPersona` 演进到 `soulConfig -> soul runtime state -> soul runtime prompt` 的运行时链路。接下来真正的基础设施短板，不再是人格表达，而是身份、租户和会话边界。

本方案的目标，是引入 Better Auth 作为认证与会话层，并完成从“默认本地 profile”到“真实多租户 profile” 的迁移。

## 目标

- 引入稳定的登录、注册、会话能力
- 移除主链对 `DEFAULT_PROFILE_ID` 的依赖
- 保留 `profiles` 作为 Buni 的业务租户边界
- 将所有业务数据按当前登录用户的 active profile 进行隔离
- 让后续 Soul、Memory、Schedule、Conversation 等模块都工作在真实租户上下文中

## 非目标

- v1 不做复杂 RBAC
- v1 不做团队协作和共享 profile
- v1 不做组织级 billing
- v1 不把 `profiles` 直接替换成 auth 的 `user`
- v1 不引入第二套 workspace 抽象

## 核心判断

### 1. 保留 `profiles`，不要把它抹平成 `users`

`user` 和 `profile` 不是一层概念：

- `user` 是认证主体
- `profile` 是 Buni 的数据与人格运行边界

`profile` 之下已经承载了：

- `agent_configs`
- `soul_configs`
- `provider_configs`
- `conversations`
- `messages`
- `memories`
- `digest_anchors`
- `events`
- `schedules`

因此更合理的关系是：

- `users` 负责身份
- `profiles` 负责租户隔离和产品上下文
- 业务表继续通过 `profile_id` 关联

### 2. `agent_configs` 与 `soul_configs` 继续保持 N:1

这个方向已经成立，不需要因为接 auth 再改：

- `profiles 1:N soul_configs`
- `agent_configs N:1 soul_configs`

`soul_configs.profile_id` 仍然是必要字段，因为它代表 soul preset 的归属边界。

### 3. v1 先不引入 Better Auth organization plugin

原因很简单：

- 我们已经有 `profiles` 作为产品级租户边界
- organization plugin 会带来第二套 workspace 语义
- 当前阶段会增加系统复杂度，但不会立刻带来业务收益

如果未来需要家庭共享、伴侣共管、团队协作，再评估：

- 新增 `profile_members`
- 或让 `profile` 与 organization 对齐

v1 不做这一步。

## 目标数据模型

### Auth 侧

新增 Better Auth 所需表：

- `users`
- `sessions`
- `accounts`
- `verifications`

说明：

- 表名直接按项目语义命名，不沿用模糊前缀
- 由 Better Auth schema + Drizzle migration 管理
- 不手写运行时建表逻辑

### Buni 业务侧

保留现有 `profiles`，并增加：

- `profiles.owner_user_id`

建议新增字段：

- `profiles.owner_user_id: text not null`
- `profiles.kind: text not null default 'personal'`
- `profiles.archived_at: text | null`

其中：

- `owner_user_id` 用于标识主拥有者
- `kind` 为后续扩展家庭/共享/团队模式预留
- `archived_at` 为软删除和历史迁移预留

### Session 扩展

在 Better Auth session 上增加：

- `activeProfileId`

它的职责是表达“当前这次会话正在操作哪个 Buni profile”。

这比把 active profile 存在客户端 local storage 更合理，因为：

- 服务端可以直接从 session 取当前租户
- API 不需要让客户端每次显式传 profile id
- 后续支持 profile 切换时，语义也更完整

## v1 关系模型

```text
users 1:N profiles
users 1:N sessions
users 1:N accounts
profiles 1:N soul_configs
profiles 1:1 agent_configs          // 当前实现更接近单 profile 单 active agent config
profiles 1:N provider_configs
profiles 1:N conversations
profiles 1:N memories
profiles 1:N schedules
profiles 1:N events
```

## 请求处理模型

引入 auth 后，服务端的链路应变成：

1. 请求进入 Hono
2. auth middleware 从 cookie / header 解析 session
3. 从 session 读取 `user.id`
4. 从 session 读取 `activeProfileId`
5. 通过 `activeProfileId` 作为业务上下文执行后续逻辑
6. 所有 repo / service 均以显式 `profileId` 作为输入

也就是说：

- repo 层继续保持纯 `profileId` 输入，不感知 auth
- route 层负责把 auth session 映射为业务上下文
- auth 只存在于边界层，不侵入核心领域逻辑

这符合 Buni 当前“functional core, imperative shell” 的结构方向。

## 运行时上下文设计

建议新增一个非常小的 server 上下文模块，例如：

- `requireSession(c)`
- `requireActiveProfile(c)`

职责：

- `requireSession(c)`：校验用户已登录，返回 session/user
- `requireActiveProfile(c)`：在 `requireSession` 基础上，返回 `{ userId, profileId }`

这样可以把今天所有 `DEFAULT_PROFILE_ID` 的使用点集中替换成：

```ts
const { profileId } = await requireActiveProfile(c);
```

而不是让每个 route 自己处理 cookie、header、session 解码。

## Profile 生命周期

### 注册时

用户注册成功后，自动创建一个默认 personal profile：

- profile name 初始可取用户昵称或 `My Buni`
- 创建默认 `agent_config`
- 创建默认 `soul_config`
- 必要时创建默认 provider config

并在首次 session 中设置：

- `activeProfileId = 刚创建的 profile.id`

### 登录时

登录成功后：

- 如果用户只有一个 profile，直接把它设为 `activeProfileId`
- 如果后续用户可能拥有多个 profile，则优先恢复最近一次使用的 profile
- 如果 session 中无 `activeProfileId`，服务端应做一次兜底恢复

### 切换 profile 时

未来可以支持：

- `POST /v1/profiles/:id/switch`

其效果只更新当前 session 的 `activeProfileId`，而不迁移数据。

v1 可以先不开放 UI，但数据模型要预留这个能力。

## 迁移策略

迁移分四层推进。

### Phase 1. 引入 Better Auth 基础设施

交付内容：

- Better Auth server 实例
- Better Auth Drizzle adapter
- auth schema 进入 `packages/db`
- auth migration 进入 `packages/db/drizzle`
- Hono 挂载 `/api/auth/*`

这一步先不替换业务 profile 获取方式，只把 auth 系统接进来。

### Phase 2. 建立 `users -> profiles` 关系

交付内容：

- 给 `profiles` 增加 `owner_user_id`
- 为现有本地单租户数据设计迁移脚本
- 注册时自动创建 personal profile
- 现有数据迁移到某个真实 user 下

这一阶段会回答“历史 local profile 怎么办”。

建议策略：

- 对老库执行一次 one-shot migration
- 创建一个真实 user
- 把原 `local` profile 绑定到该 user
- 之后不再依赖 `DEFAULT_PROFILE_ID`

### Phase 3. route 层切到 session profile

交付内容：

- server 路由新增 `requireActiveProfile`
- 所有 `DEFAULT_PROFILE_ID` 替换为 session 中的 `profileId`
- chat / memory / config / schedule / events / conversations 全部切换

这一步完成后，系统从“伪多租户”进入“真实多租户”。

### Phase 4. mobile 接入登录态

交付内容：

- mobile 引入 Better Auth client
- 登录 / 注册页面
- 会话续期和登出
- 未登录态守卫
- 设置页支持查看当前用户和当前 profile

完成后，产品主链闭环。

## Drizzle 与迁移原则

迁移原则必须统一：

- 常规关系表变更通过 Drizzle schema + migration 维护
- 运行时不再偷偷修表
- `packages/db/src/client/index.ts` 只保留：
  - SQLite 初始化
  - Drizzle migration 执行
  - `sqlite-vec` 加载
  - `vec_memories` 虚表保障

特殊说明：

- `vec_memories` 是 `sqlite-vec` 的虚表，不适合完全按常规 Drizzle 表处理
- `vec_memories_chunks / info / rowids / vector_chunks00` 属于扩展维护的 backing tables
- 这些内部表不进入 Drizzle schema

## Better Auth 接入原则

### v1 开启能力

- email/password 登录
- session 持久化
- register / sign-in / sign-out
- session 获取与续期

### v1 不做

- organization plugin
- 管理后台
- 复杂权限模型
- 第三方 OAuth

### 用户模型建议

认证层 user 保持通用、轻量：

- `id`
- `email`
- `name`
- `image`
- 时间戳字段

不要把 Buni 的人格、关系、Soul 等业务属性塞进 auth user。

这些都应继续存在于：

- `profiles`
- `agent_configs`
- `soul_configs`

## 服务端改造点

### 新增

- auth server 模块
- auth middleware / helpers
- profile resolver

### 修改

- `apps/server/src/app.ts`
  - 挂载 auth 路由
  - 增加跨域和 cookie 相关配置
- `apps/server/src/routes/*`
  - 全部从 `DEFAULT_PROFILE_ID` 改为 `requireActiveProfile(c)`
- `apps/server/src/ai/chat-service.ts`
  - 由 route 传入真实 `profileId`

### 保持不变

- `packages/core` 的核心运行时纯函数
- repo 层的 `profileId` 显式传参风格
- memory / soul / planner 的核心逻辑

## Mobile 改造点

### 新增

- auth client 初始化
- 登录页
- 注册页
- 会话状态 hook

### 修改

- API 请求默认携带 credentials
- 根路由增加会话守卫
- 设置页增加 account / profile 信息

### 暂不做

- 多 profile 切换 UI
- 账号安全中心
- 邮箱验证完整流程

## 为什么不直接只用 `users` 而删除 `profiles`

如果直接让所有业务表关联 `user_id`，会立刻失去几个重要能力：

- 一个用户拥有多个 Buni 身份空间
- 不同 Soul preset / provider config / memory graph 的隔离边界
- 未来共享/家庭/实验 profile 的演进空间

换句话说，`profile` 不是冗余层，而是 Buni 这个产品的真正业务容器。

## 对现有 Soul Runtime 的影响

Soul runtime pipeline 不需要因为接 auth 而重写。

变化只在入口：

- 过去：`DEFAULT_PROFILE_ID -> getSoulConfig(profileId)`
- 未来：`session.activeProfileId -> getSoulConfig(profileId)`

也就是说，Soul runtime 的运行频次和时机不变：

- 仍然是按每次 chat 请求 / 每个用户 turn 计算
- 不是只在连接建立时跑一次
- 也不是 token 级别执行

auth 只解决“这个 turn 属于哪个租户”，不改变 soul runtime 自身的算法边界。

## 风险与注意事项

### 1. 历史数据迁移

如果已经存在本地开发数据，需要一条明确迁移路径：

- 旧 `local` profile 如何绑定到真实 user
- 旧 provider config 是否继续沿用
- 旧 soul config 是否保持活跃

这部分需要 migration + 一次性数据修复脚本配合。

### 2. Cookie / CORS

移动端和本地开发环境要注意：

- 跨域 cookie
- `credentials: include`
- 本地开发域名和端口一致性

### 3. Session 与 profile 状态一致性

如果用户 profile 被删除或归档，而 session 还持有旧的 `activeProfileId`，需要服务端兜底：

- 自动切换到可用 profile
- 或要求用户重新选择

### 4. Route 级鉴权覆盖率

迁移过程中最容易漏掉的，是少量仍然使用 `DEFAULT_PROFILE_ID` 的 route。

因此替换时要按模块全量扫描：

- chat
- config
- conversations
- messages
- memories
- schedules
- events

## 推荐实施顺序

1. 引入 Better Auth 与 auth schema
2. 给 `profiles` 增加 `owner_user_id`
3. 完成老数据迁移策略
4. 实现 `requireSession` / `requireActiveProfile`
5. 替换所有 server route 的 `DEFAULT_PROFILE_ID`
6. mobile 接 login/register/session
7. 删除残余默认本地 profile 依赖

## v1 完成标准

满足以下条件，视为 auth + multi-tenancy 迁移完成：

- 用户可以注册、登录、登出
- 每个用户都有真实 personal profile
- 所有主链路请求都从 session 获取 `profileId`
- 不再依赖 `DEFAULT_PROFILE_ID`
- Soul / Memory / Schedule / Conversation 全部在真实租户下工作
- 数据库关系表结构只通过 Drizzle migration 管理

## 后续演进方向

### 1. 多 profile

支持一个用户拥有多个 Buni profile：

- personal
- couple
- family
- experimental

### 2. Profile 成员关系

可以增加：

- `profile_members`

用于支持共享陪伴空间。

### 3. Organization 对齐

当产品真的出现团队协作和权限模型时，再评估是否引入 Better Auth organization plugin，并让 `profile` 与 organization 建立映射。

### 4. 账户安全增强

- 邮箱验证
- 密码重置
- 设备管理
- session revoke

---

这份文档对应的是 Buni 当前阶段的落地方案：认证系统交给 Better Auth，业务租户边界继续由 `profiles` 承担，所有核心能力都围绕“当前 session 的 active profile”运行。
