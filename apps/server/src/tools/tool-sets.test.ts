import { describe, expect, test } from "vitest";

import {
  defaultMaterializedToolAllowlist,
  executionToolNames,
  scheduleMutationToolNames,
} from "./execution-tool-names";
import { createChatToolSet, createExecutionTools } from "./tool-sets";

const createToolContext = () => ({
  profileId: "profile-1",
  conversationId: "conversation-1",
  turnId: "turn-1",
  clientTimezone: "Asia/Shanghai",
  profileTimezone: "Asia/Shanghai",
  defaultTimezone: "Asia/Shanghai",
  referenceNow: "2026-06-03T00:00:00.000Z",
  embeddingConfig: null,
  abortSignal: new AbortController().signal,
});

describe("createExecutionTools", () => {
  test("registers now alongside other execution tools and omits dropped reflection tools", () => {
    const tools = createExecutionTools(createToolContext());
    const toolNames = tools.map((tool) => tool.name as string);

    expect(toolNames.includes("now")).toBe(true);
    expect(toolNames.includes("get_github_trending_repos")).toBe(false);
    expect(toolNames.includes("resolve_datetime")).toBe(false);
    expect(toolNames.includes("resolve_news_source")).toBe(true);
    expect(toolNames.includes("create_reflection_report")).toBe(false);
    expect(toolNames.includes("get_reflection_report")).toBe(false);
    expect(toolNames.includes("list_reflection_reports")).toBe(false);
    expect(toolNames.includes("update_reflection_report")).toBe(false);
    expect(toolNames.includes("delete_reflection_report")).toBe(false);
    expect(toolNames.includes("resolve_reflection_report")).toBe(false);
    expect(toolNames.includes("rebuild_reflection_report")).toBe(false);
    expect(toolNames.includes("compare_reflection_reports")).toBe(false);
    expect(toolNames.includes("inspect_reflection_report_input")).toBe(false);
  });

  test("registers all five web tools", () => {
    const tools = createExecutionTools(createToolContext());
    const toolNames = tools.map((tool) => tool.name as string);

    expect(toolNames.includes("open_url")).toBe(true);
    expect(toolNames.includes("extract_page")).toBe(true);
    expect(toolNames.includes("save_page_to_knowledge")).toBe(true);
    expect(toolNames.includes("search_web")).toBe(true);
    expect(toolNames.includes("summarize_page")).toBe(true);
  });

  test("registers the generic channel delivery tools", () => {
    const tools = createExecutionTools(createToolContext());
    const toolNames = tools.map((tool) => tool.name as string);

    expect(toolNames.includes("list_channel_targets")).toBe(true);
    expect(toolNames.includes("send_channel_message")).toBe(true);
  });

  test("matches the exported execution tool name inventory", () => {
    const tools = createExecutionTools(createToolContext());
    const toolNames = tools.map((tool) => tool.name as string).sort();

    expect(toolNames).toEqual([...executionToolNames].sort());
  });
});

describe("createChatToolSet", () => {
  test("does not register deprecated open_settings client tools", () => {
    const tools = createChatToolSet(createToolContext());
    const toolNames = tools.map((tool) => tool.name as string);

    expect(toolNames.includes("open_settings")).toBe(false);
  });
});

describe("defaultMaterializedToolAllowlist", () => {
  test("removes schedule mutation tools while keeping normal execution tools", () => {
    expect(defaultMaterializedToolAllowlist.includes("send_feishu_message")).toBe(true);
    expect(defaultMaterializedToolAllowlist.includes("send_chat_message")).toBe(true);

    for (const toolName of scheduleMutationToolNames) {
      expect(defaultMaterializedToolAllowlist.includes(toolName)).toBe(false);
    }
  });
});
