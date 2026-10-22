const executionToolNames = [
  "create_schedule",
  "delete_schedule",
  "extract_page",
  "get_schedule",
  "get_news_brief",
  "get_news_headlines",
  "list_channel_targets",
  "list_feishu_delivery_logs",
  "list_feishu_targets",
  "list_news_briefs",
  "list_news_sources",
  "list_qq_targets",
  "list_schedules",
  "now",
  "open_url",
  "resolve_news_source",
  "create_reminder",
  "save_page_to_knowledge",
  "search_web",
  "search_news_sources",
  "send_channel_message",
  "send_chat_message",
  "send_feishu_message",
  "send_qq_message",
  "summarize_page",
  "update_schedule",
] as const;

const scheduleMutationToolNames = [
  "create_schedule",
  "create_reminder",
  "update_schedule",
  "delete_schedule",
] as const;

const scheduleMutationToolNameSet = new Set<string>(scheduleMutationToolNames);

const defaultMaterializedToolAllowlist = executionToolNames.filter(
  (toolName) => !scheduleMutationToolNameSet.has(toolName)
);

export {
  defaultMaterializedToolAllowlist,
  executionToolNames,
  scheduleMutationToolNameSet,
  scheduleMutationToolNames,
};
