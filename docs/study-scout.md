# Study Scout

设计文档正文放在文档站，随代码一起演进：

**→ `apps/fumadocs/content/docs/buni/study/study-scout.md`**

要点：

- 每天 1 次「今日精选」Telegram 摘要（2–3 条），候选来自 DeepSeek Search / Fetch API
  （`https://api.deepseek.com/v1/tools/search`、`/v1/tools/fetch`，$0.75 / 1000 次成功请求）。
- Key 走独立的 `web_search` provider 槽位（DeepSeek 平台 key），与推理 provider
  分开配置；老 profile 未配置该槽位时才回退到「推理 provider 是 DeepSeek」。
- 流水线：兴趣画像 → 5 条确定性 query → 免费过滤（分数/权威/时效/去重/配额/负反馈）→
  1 次 LLM 排序 → 推送（与 nudge 共用每日 3 条预算）。
- 按钮：收藏到知识库 / 出 3 道延伸题写进 lesson 自检 / 不感兴趣 / 明晚再看。
- 状态全部落在事件流（`study.scout_*`），不新增表。
