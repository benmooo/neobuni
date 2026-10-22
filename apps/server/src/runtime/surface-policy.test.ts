import { describe, expect, test } from "vitest";

import {
  applyMemoryPolicy,
  filterToolNamesForSurfacePolicy,
  getSurfacePolicy,
} from "./surface-policy";

const sorted = (value: string[] | null) => (value ? [...value].sort() : value);

describe("surface-policy", () => {
  test("returns a public-safe group policy with no memory access", () => {
    const policy = getSurfacePolicy("chat_public_safe");

    expect(policy.allowMemoryRecall).toBe(false);
    expect(policy.allowMemoryWrite).toBe(false);
    expect(policy.responseVisibility).toBe("group");
  });

  test("uses an explicit group-safe allowlist for chat_public_safe", () => {
    const policy = getSurfacePolicy("chat_public_safe");

    expect(sorted(policy.toolAllowlist)).toEqual(
      sorted([
        "create_schedule",
        "create_reminder",
        "delete_schedule",
        "get_news_brief",
        "get_news_headlines",
        "get_schedule",
        "list_channel_targets",
        "list_news_briefs",
        "list_news_sources",
        "list_schedules",
        "now",
        "open_url",
        "extract_page",
        "resolve_news_source",
        "search_news_sources",
        "search_web",
        "send_channel_message",
        "summarize_page",
        "update_schedule",
      ])
    );
  });

  test("uses a research-and-delivery allowlist for task_run_public_safe", () => {
    const policy = getSurfacePolicy("task_run_public_safe");

    expect(sorted(policy.toolAllowlist)).toEqual(
      sorted([
        "get_news_brief",
        "get_news_headlines",
        "list_channel_targets",
        "list_news_briefs",
        "list_news_sources",
        "now",
        "open_url",
        "extract_page",
        "resolve_news_source",
        "search_news_sources",
        "search_web",
        "send_channel_message",
        "summarize_page",
      ])
    );
  });

  test("filters schedule mutations out of public-safe task runs", () => {
    expect(
      filterToolNamesForSurfacePolicy(
        ["create_schedule", "search_web", "send_channel_message"],
        getSurfacePolicy("task_run_public_safe")
      )
    ).toEqual(["search_web", "send_channel_message"]);
  });

  test("drops memory slices for public-safe surfaces", () => {
    expect(
      applyMemoryPolicy({
        policy: getSurfacePolicy("chat_public_safe"),
        unresolvedSlices: [{ id: "u1" }],
        recentSlices: [{ id: "r1" }],
      })
    ).toEqual({
      unresolvedSlices: [],
      recentSlices: [],
    });
  });
});
