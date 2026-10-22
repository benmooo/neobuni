---
title: "Buni Chat Rich Text Rendering"
---

# Buni Chat Rich Text Rendering

> 版本：2.1  
> 日期：2026-05-01  
> 状态：Implemented

---

## 0. 背景

当前聊天页 assistant 正文已经切到 `Streamdown`：

- `apps/mobile/src/components/chat/AssistantMessageParts.tsx`
  - `text` part 走 `AssistantMarkdown`
- `apps/mobile/src/components/chat/AssistantMarkdown.tsx`
  - 负责 `Streamdown` 渲染
- `apps/mobile/src/components/chat/assistant-markdown-config.ts`
  - 负责 `plugins / animation / linkSafety / translations / renderState`
- `thinking / tool-call / tool-result`
  - 已经是独立结构化卡片
- `usePersistentChat()`
  - 已经有 `isLoading / status / activeAssistantMessage`
  - 已经能区分“当前正在流式生成的 assistant message”和历史消息

之前基于 `react-markdown` 的方案已经移除。

原因不是“markdown 不需要了”，而是：

- 聊天正文是 **流式、不完整、持续增长** 的内容
- 通用静态 markdown renderer 不是这个场景的最佳抽象
- 我们需要一个对 AI streaming content 更友好的渲染层

这版方案统一切换到 **Streamdown**。

---

## 1. 方案结论

### 1.1 核心决策

assistant `text` part 改为使用 `Streamdown` 渲染。

保持以下边界不变：

- `thinking` 继续用 `ThinkingBlock`
- `tool-call` 继续用 `ToolCallBlock`
- `tool-result` 继续用 `ToolResultBlock`
- user message 仍然保持纯文本

也就是说，这次不是把整个消息系统 markdown 化，而是只升级 assistant 正文渲染器。

### 1.2 为什么是 Streamdown

我们需要的不是“把完整 markdown 字符串转成 React 树”，而是：

- 对未闭合 markdown 的可恢复渲染
- 对流式追加文本的稳定更新
- 对 AI 内容常见场景的安全与交互边界
- 对流式文本的性能优化，而不是每次全量重新走普通 markdown pipeline

这正是 Streamdown 的设计中心。

---

## 2. 目标与非目标

### 2.1 目标

- assistant 输出 markdown 时，正文可读
- 流式生成中的未闭合 markdown 不要频繁闪烁或塌掉
- 历史消息和实时消息走同一渲染组件，但模式不同
- 数学公式要有清晰的接入策略
- 不破坏现有 thinking / tool activity 信息架构

### 2.2 非目标

- 不把 runtime spans 渲染进聊天正文
- 不把 tool result 再二次 markdown 化
- 不把 user message 改成 markdown
- 不在 V1 里做 code highlight / custom tags 全家桶
- 不在前端做大量“猜测式字符串修复”

最后一点很重要：

V1 不再引入类似“把 `\[` 猜成 `$$`”这种 heuristic 兼容层。
渲染器应该有明确 contract，格式偏差要么通过插件能力解决，要么通过模型输出约束解决。

---

## 3. 当前代码基线

### 3.1 已有能力

当前代码里已经有两个很关键的能力，可直接复用：

1. `usePersistentChat()` 已能派生当前活跃 assistant message
2. `activity-model.ts` 已能判断当前是否在生成、思考、调工具

这意味着我们不需要引入额外 runtime channel，就能判断：

- 哪一条 assistant message 是 streaming 的
- 哪些正文应该走 streaming mode
- 哪些正文应该走 static mode

### 3.2 当前问题

当前已解决的问题：

- assistant 正文已具备流式友好 markdown 渲染
- 历史消息与当前 streaming 消息已区分 `static / streaming` mode
- 数学公式与 Mermaid 图已接入插件
- 链接已接入最小 link safety

当前仍未覆盖：

- `@streamdown/code`
- `@streamdown/cjk`
- 自定义 link safety modal
- 自定义 markdown tag / annotation blocks

---

## 4. 推荐模块边界

建议新增以下组件，而不是把 Streamdown 直接塞进 `AssistantMessageParts.tsx`：

```text
apps/mobile/src/components/chat/
  AssistantMarkdown.tsx
  assistant-markdown-config.ts
```

职责建议：

- `AssistantMessageParts.tsx`
  - 负责 `message.parts` 路由
  - 不关心 markdown renderer 内部细节
- `AssistantMarkdown.tsx`
  - 负责 assistant `text` part 的 Streamdown 渲染
  - 负责 `mode / isAnimating / plugins / linkSafety` 选择
- `assistant-markdown-config.ts`
  - 纯配置与纯函数
  - 导出 Streamdown 配置、插件、样式类名、纯辅助函数

这样可以保持：

- functional core：配置、判定、映射都是纯函数
- imperative shell：React 组件只负责把状态喂给 Streamdown

---

## 5. 渲染架构

### 5.1 part 级集成，而不是整条消息拼接

assistant message 仍然按 `parts` 顺序渲染：

1. `thinking`
2. `tool-call`
3. `tool-result`
4. `text`

`text` part 使用 `AssistantMarkdown`。

原因：

- 我们必须保留 tool / thinking 在消息中的结构位置
- 不能为了 markdown 渲染把整条消息重新拼成一个大字符串
- tool 前后的正文应该各自独立渲染

### 5.2 streaming message 与历史消息的差异

同一个 `AssistantMarkdown` 组件需要支持两种模式：

- **streaming**
  - 用于当前活跃 assistant message 中仍在增长的 `text` part
- **static**
  - 用于历史 assistant message
  - 也用于当前消息在生成结束后的稳定展示

推荐判定：

```ts
type AssistantMarkdownRenderState = {
  mode: "streaming" | "static";
  isAnimating: boolean;
};
```

```ts
const getAssistantMarkdownRenderState = ({
  messageId,
  activeAssistantMessageId,
  isLoading,
}: {
  messageId: string;
  activeAssistantMessageId: string | null;
  isLoading: boolean;
}): AssistantMarkdownRenderState => ({
  mode:
    isLoading && messageId === activeAssistantMessageId
      ? "streaming"
      : "static",
  isAnimating: isLoading && messageId === activeAssistantMessageId,
});
```

---

## 6. Streamdown 接入设计

### 6.1 当前依赖

当前已使用：

- `streamdown@latest`
- `@streamdown/math@latest`
- `@streamdown/mermaid@latest`
- `katex@latest`

当前未接入：

- `@streamdown/code`
- `@streamdown/cjk`

原因：

- code highlight 不是当前主诉求
- CJK 插件会改变解析行为，适合在有明确中文断词/强调问题时再接

### 6.2 组件形态

`AssistantMarkdown.tsx` 建议只暴露最小接口：

```ts
type AssistantMarkdownProps = {
  content: string;
  messageId: string;
  activeAssistantMessageId: string | null;
  isLoading: boolean;
};
```

内部流程：

1. 空字符串直接返回 `null`
2. 根据 `messageId / activeAssistantMessageId / isLoading` 推导 `mode`
3. 以纯配置方式创建 `plugins / linkSafety / className`
4. 渲染 `<Streamdown />`

### 6.3 推荐接线

`MessageBubble` 当前已经知道整条 `message`。

最直接的改法是把以下信息继续往下传：

- `message.id`
- `activeAssistantMessageId`
- `isLoading`

不要在 `AssistantMarkdown` 里自己读 hook。
渲染器应该是纯输入组件。

---

## 7. 数学公式策略

### 7.1 设计原则

数学公式这块不要再做“前端猜语法”。

我们要先定义 **支持 contract**，再决定模型输出和插件配置。

### 7.2 当前 contract

当前明确支持：

- block math：`$$ ... $$`
- inline math：`$ ... $`

实现方式：

```ts
createMathPlugin({
  singleDollarTextMath: true,
});
```

当前取舍：

- 直接启用 `singleDollarTextMath`
- 接受金额文本存在误判风险
- 用模型输出习惯与真实聊天场景优先，优于严格避免误判

### 7.4 明确不做的事

当前仍不保证：

- `\(...\)`
- `\[...\]`
- 任意 TeX 环境自动猜测修复

如果模型经常输出这些格式，优先从 **system prompt / model output contract** 修正，而不是在前端 renderer 里堆规则。

---

## 8. 安全策略

AI 输出默认应视为不可信文本。

因此 V1 推荐：

- 保留 Streamdown 的 link safety 能力
- 对允许协议和链接前缀做显式收敛
- 不开放任意 HTML 自定义能力

文档层的抽象策略如下：

```ts
type AssistantMarkdownSecurity = {
  allowedProtocols: string[];
  allowedImagePrefixes: string[];
  allowedLinkPrefixes: string[];
};
```

当前实现并不是按前缀白名单硬编码，而是按 `URL` 解析结果做判定：

```ts
const isTrustedAssistantLink = (url: string) => {
  const parsed = parseAssistantLink(url);

  if (!parsed) return false;
  if (parsed.protocol === "mailto:" || parsed.protocol === "tel:") return true;
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (typeof window !== "undefined" && parsed.origin === window.location.origin) return true;

  return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
};
```

备注：

- 如果未来需要支持 `buni://` 或内部 deep link，再显式加进去
- 当前外链仍使用 Streamdown 默认 modal，后续可替换成 Buni dialog

---

## 9. 样式策略

### 9.1 总原则

Streamdown 已经是带观点的 renderer，不建议一上来重写全部元素映射。

V1 样式策略：

- 优先使用 Streamdown 默认结构
- 外层只加 Buni 气泡内边距、颜色和 spacing
- 真要调整，优先通过外层 class 和少量 selector 调整
- 不在 V1 把每个标签都写成自定义 React 组件

### 9.2 Tailwind v4 集成

由于你们是 Tailwind v4，`apps/mobile/src/styles.css` 里需要给 Streamdown 包路径加 `@source`。

当前写法：

```css
@import "katex/dist/katex.min.css";
@import "streamdown/styles.css";
@import "@buni/ui/globals.css";

@source "../../../node_modules/streamdown/dist/*.js";
@source "../../../node_modules/@streamdown/math/dist/*.js";
@source "../../../node_modules/@streamdown/mermaid/dist/*.js";
```

如果后续引入其他 Streamdown 插件，再继续补对应 `@source`。

### 9.3 KaTeX 样式

如果启用 `@streamdown/math`，还需要引入 `katex` 样式。

建议：

- 在 `apps/mobile/src/styles.css` 顶部 `@import "katex/dist/katex.min.css";`
- 不要把公式样式放到组件局部 import，避免多入口重复

### 9.4 动画

当前实现：

- `mode="streaming"` 用于当前活跃 assistant message
- `isAnimating` 跟随 streaming 状态
- `caret="block"`
- `animated` 已开启，但参数保持保守

当前配置：

```ts
const assistantMarkdownAnimated = {
  animation: "blurIn",
  duration: 220,
  easing: "ease-out",
  sep: "word",
};
```

如果实际体验里动画仍然偏吵，优先调低 `duration` 或直接关掉 `animated`，而不是继续叠更多动效。

---

## 10. Link Safety 与产品体验

Streamdown 的 link safety 是有价值的，但默认 modal 未必符合 Buni 的产品语言。

当前实现：

- 保留默认 link safety modal
- 同源链接、`localhost`、`127.0.0.1`、`mailto:`、`tel:` 直接视为可信
- 其他外链进入安全确认流程

后续可做：

- 用 Buni 自己的 dialog 替换默认 modal
- 对 first-party domain 做更细粒度白名单

---

## 11. 推荐类型设计

```ts
type AssistantMarkdownProps = {
  content: string;
  messageId: string;
  activeAssistantMessageId: string | null;
  isLoading: boolean;
};
```

```ts
type AssistantMarkdownRenderState = {
  mode: "streaming" | "static";
  isAnimating: boolean;
};
```

```ts
type AssistantMarkdownSecurity = {
  allowedProtocols: string[];
  allowedImagePrefixes: string[];
  allowedLinkPrefixes: string[];
};
```

```ts
type AssistantMarkdownConfig = {
  animated: NonNullable<StreamdownProps["animated"]>;
  className: string;
  mode: "streaming" | "static";
  isAnimating: boolean;
  security: LinkSafetyConfig;
};
```

纯函数建议：

```ts
const normalizeAssistantMarkdownContent = (content: string) => content.trim();

const isEmptyAssistantMarkdownContent = (content: string) =>
  normalizeAssistantMarkdownContent(content).length === 0;

const isActiveStreamingMessage = ({
  messageId,
  activeAssistantMessageId,
  isLoading,
}: {
  messageId: string;
  activeAssistantMessageId: string | null;
  isLoading: boolean;
}) => isLoading && messageId === activeAssistantMessageId;
```

这些函数都应该放在 `assistant-markdown-config.ts`，不要散落在组件里。

---

## 12. 实施计划

### 已完成

- 安装 `streamdown@latest`
- 安装 `@streamdown/math@latest`
- 安装 `@streamdown/mermaid@latest`
- 安装 `katex@latest`
- 新增 `AssistantMarkdown.tsx`
- 新增 `assistant-markdown-config.ts`
- 把 assistant `text` part 从纯文本切到 `Streamdown`
- 根据 `activeAssistantMessageId + isLoading` 区分 `streaming/static`
- 接入 math plugin
- 接入 Mermaid plugin
- 开启 `animated` 与 `caret`
- 接入最小安全配置
- 补 `styles.css` 的 `@source`、`streamdown/styles.css` 与 `katex` import

### 下一阶段

- 替换默认 link safety modal 为 Buni dialog
- 评估是否需要 `@streamdown/code`
- 评估是否需要 `@streamdown/cjk`
- 根据真实聊天样本微调动画参数

### 后续扩展

- 评估 custom tags / annotation blocks
- 如果未来要支持知识引用卡片，再看 `allowedTags` 与自定义渲染

---

## 13. 风险与取舍

### 13.1 风险

- Streamdown 是更强的 renderer，也意味着配置面更大
- 数学公式定界符如果没有统一 contract，仍然会有“用户觉得应该渲染但实际不渲染”的情况
- Tailwind v4 如果漏了 `@source`，会出现样式缺失
- link safety 如果直接全开默认 UI，可能和 Buni 的视觉语言不一致

### 13.2 我们的取舍

- 先解决 streaming correctness，再加轻量 animation，而不是重动画
- 数学公式接受 `$...$` 风险，以真实聊天可用性优先
- 先用默认 link safety，再做产品化替换
- Mermaid 作为高频用例已提前接入
- 保留 tool/thinking 的结构化展示，不做“大一统 markdown message”

---

## 14. 验收标准

- assistant 正文在流式生成时，未闭合 markdown 结构能稳定展示
- 历史 assistant 消息走 static mode，视觉稳定
- thinking / tool-call / tool-result 继续按结构化卡片展示
- 开启 math plugin 后，`$$...$$` 与 `$...$` 公式都能渲染
- fenced `mermaid` 代码块能渲染为图，并支持 copy / download / fullscreen / panZoom
- streaming 状态下有 caret 与轻量动画反馈
- 危险链接不会直接无提示跳转
- 不再依赖 `react-markdown` 相关实现

---

## 15. 推荐下一步

当前最值得继续推进的是：

1. 把默认 link safety modal 替换成 Buni dialog
2. 评估是否接 `@streamdown/code`
3. 观察真实对话输出，再决定是否需要 `@streamdown/cjk`
4. 根据真实体验继续收敛动画参数

这样能在不扩大复杂度太多的前提下，把当前实现继续产品化。
