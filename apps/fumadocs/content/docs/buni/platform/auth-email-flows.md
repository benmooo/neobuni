---
title: "Buni Auth 邮件流实现方案"
---

# Buni Auth 邮件流实现方案

## 背景

Buni 当前已经启用了 Better Auth 的：

- `emailAndPassword.enabled = true`
- `emailAndPassword.requireEmailVerification = true`

这意味着注册与登录行为已经进入“必须先验证邮箱”的模式，但项目里还缺少完整的邮件链路与前端承接页面：

- 注册后发送验证邮件
- 手动重发验证邮件
- 点击邮件后的验证回跳页
- 忘记密码申请邮件
- 点击邮件后的密码重置页

同时，我们希望邮件 provider 统一使用 Resend，而不是再自建 SMTP 适配层。

## 目标

- 用 Resend 实现 Better Auth 所需的邮件发送能力
- 完成 email verification 的注册、重发、验证回跳全链路
- 完成 forgot password / reset password 全链路
- 在 mobile auth 路由下补齐承接页面
- 保持当前多租户与 profile 生命周期不变

## 非目标

- 当前阶段不做 magic link 登录
- 当前阶段不做邮箱 OTP
- 当前阶段不做邮箱模板国际化系统
- 当前阶段不做独立通知中心或投递日志后台

## 技术判断

### 1. 邮件发送只放在 server 边界层

Better Auth 已经定义了验证和重置密码的 token 生成与回跳行为，我们不需要重新造轮子。

因此职责划分是：

- Better Auth：生成 token、验证 token、处理 verify/reset callback
- Resend：负责把最终链接发出去
- Buni server：负责模板拼装、环境变量管理、把 Better Auth hook 接到 Resend
- mobile：负责承接 callback 后的用户体验

### 2. callback URL 由前端显式传入

验证邮件和重置密码邮件都依赖 callback URL：

- 验证邮箱：Better Auth 会生成 `.../verify-email?token=...&callbackURL=...`
- 重置密码：Better Auth 会生成 `.../reset-password/:token?callbackURL=...`

因此前端必须在发起请求时显式传入自己的承接地址，例如：

- `/auth/verify-email/callback`
- `/auth/reset-password`

这样服务端无需猜测当前前端运行在哪个域名或端口。

### 3. mobile 只承接结果，不参与 token 校验

token 的校验继续交给 Better Auth 服务端。

mobile 页面只负责：

- 展示“请去邮箱点击验证链接”
- 让用户手动重发邮件
- 承接 verify-email 的回跳结果
- 承接 reset-password 的 token 和错误信息
- 提交新的密码

这符合“functional core, imperative shell”：

- auth 核心逻辑留在 Better Auth / server
- UI 和交互承接留在 mobile

## 依赖与环境变量

### 新增依赖

- `resend@latest`

### 服务端环境变量

建议增加：

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `BUNI_APP_URL`

说明：

- `RESEND_API_KEY`：Resend API Key
- `RESEND_FROM_EMAIL`：发件人，例如 `Buni <noreply@example.com>`
- `BUNI_APP_URL`：前端公开地址，主要用于邮件正文里的辅助链接与文案；真正的 callback 仍以前端请求里传入的 `callbackURL / redirectTo` 为准

开发期如果没有显式配置 `BUNI_APP_URL`，mobile 端可以回退使用当前页面的 `window.location.origin` 来生成 callback URL。

## Better Auth 配置

### email verification

在 `authOptions` 中补齐：

- `emailVerification.sendVerificationEmail`
- `emailVerification.sendOnSignIn = true`

`sendOnSignUp` 可以不显式配置，因为在 `requireEmailVerification = true` 下，注册时本就会发送验证邮件。

可选增强：

- `emailVerification.autoSignInAfterVerification = true`

是否启用这个选项要看体验偏好：

- 开启：邮箱验证成功后，Better Auth 会自动建立 session
- 不开启：验证成功后仍需要用户回登录页手动登录

v1 可以启用，但前端仍然不能强依赖它一定成功，因为浏览器上下文和 App WebView 未必共享 cookie。

### reset password

在 `emailAndPassword` 中补齐：

- `sendResetPassword`

Better Auth 会自行生成 reset token 和回跳 URL，server 只需要把 `url` 发给用户。

## 邮件模板策略

v1 使用轻量模板即可，不引入 React Email。

每封邮件提供：

- subject
- html
- text

两类模板：

1. 邮箱验证邮件
2. 重置密码邮件

模板要求：

- 风格克制，延续 Buni 当前 auth 页面调性
- 主 CTA 明确
- 备用纯文本链接可复制
- 提示链接有效期和安全说明

## Mobile 路由设计

在 `/auth` 下新增以下页面：

- `/auth/verify-email`
- `/auth/verify-email/callback`
- `/auth/forgot-password`
- `/auth/reset-password`

### `/auth/verify-email`

职责：

- 展示“验证邮件已发送”
- 提示用户检查收件箱/垃圾箱
- 支持手动重发验证邮件
- 从 query 中读取 email，用于回显和重发

### `/auth/verify-email/callback`

职责：

- 承接 Better Auth 验证成功或失败后的跳转
- 如果 query 中有 `error`，展示失败态
- 如果没有 `error`，展示成功态
- 可尝试读取 session，若已存在则允许直接进入 `/chat`

### `/auth/forgot-password`

职责：

- 输入邮箱
- 调用 `requestPasswordReset({ email, redirectTo })`
- 返回统一成功提示，不暴露邮箱是否存在

### `/auth/reset-password`

职责：

- 从 query 中读取 `token` 或 `error`
- 若无 token 且有错误，展示无效/过期态
- 若有 token，允许输入新密码并提交 `resetPassword`

## 页面流转

### 注册

1. 用户在 `/auth/sign-up` 提交邮箱、昵称、密码
2. `authClient.signUp.email` 传入 `callbackURL = /auth/verify-email/callback`
3. 注册成功后跳转 `/auth/verify-email?email=...`
4. 用户点击邮件中的链接
5. Better Auth 验证 token 后跳转 `/auth/verify-email/callback`
6. callback 页展示成功态，并引导进入登录或直接进入聊天

### 登录但邮箱未验证

1. 用户在 `/auth/sign-in` 提交邮箱密码
2. Better Auth 返回 `EMAIL_NOT_VERIFIED`
3. 若 `sendOnSignIn = true`，系统会自动补发验证邮件
4. 前端跳转 `/auth/verify-email?email=...&resent=1`

### 忘记密码

1. 用户在 `/auth/forgot-password` 输入邮箱
2. `authClient.requestPasswordReset({ email, redirectTo: /auth/reset-password })`
3. 用户收到邮件并点击
4. Better Auth 验证 reset token 有效后跳转 `/auth/reset-password?token=...`
5. 用户输入新密码并调用 `authClient.resetPassword`
6. 成功后回登录页

## 错误处理

### 服务端

- Resend 未配置：直接抛错，避免注册成功但无法验证
- 邮件发送失败：让 Better Auth 请求失败，前端展示明确错误

### 前端

- `EMAIL_NOT_VERIFIED`：跳转验证邮箱等待页
- `INVALID_TOKEN` / `TOKEN_EXPIRED`：在 callback/reset 页给出明确提示
- 忘记密码申请成功：统一显示“如果邮箱存在，我们已发送邮件”

## 安全要求

- 不在前端返回真实 API Key
- 不在调试页泄露邮件 provider 的敏感字段
- 忘记密码接口不暴露邮箱是否存在
- 重置密码页面必须依赖 Better Auth token，而不是自定义本地状态

## 实现顺序

1. 安装 `resend`
2. 新增 server mailer 与模板
3. 在 Better Auth options 中接上 `sendVerificationEmail` 和 `sendResetPassword`
4. 新增 mobile auth 页面
5. 改造 sign-up / sign-in / forgot-password 入口
6. 补类型检查与 mobile build 验证

## 后续优化方向

### 1. React Email 模板化

当邮件模板开始增多时，可以再引入 React Email 或独立模板系统。

### 2. 统一通知基础设施

未来可以把 auth 邮件、系统通知、运营邮件统一抽象为 notification layer。

### 3. 投递可观测性

后续可记录：

- 邮件类型
- 目标邮箱
- 投递时间
- provider message id
- 成功/失败状态

### 4. 多端深链

如果未来 Buni 走原生移动端或桌面端，callback URL 可以演进为：

- Web URL
- App deep link
- 带 fallback 的双跳转策略
