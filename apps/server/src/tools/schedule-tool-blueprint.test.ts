import { describe, expect, test } from "vitest";

import {
  buildScheduleBlueprintFromCreateInput,
  mergeScheduleBlueprintForUpdate,
  normalizeScheduleBlueprint,
} from "./schedule-tool-blueprint";

describe("schedule-tool-blueprint", () => {
  test("buildScheduleBlueprintFromCreateInput captures prompt, tool policy, and delivery intent", () => {
    const blueprint = buildScheduleBlueprintFromCreateInput({
      type: "monitor",
      title: "Morning GitHub Trending via NewsNow",
      content: "Resolve and send GitHub Trending headlines",
      taskPrompt:
        "Resolve GitHub Trending to its canonical NewsNow source, fetch the latest headlines, and send them to Telegram.",
      cronExpr: "0 8 * * *",
      triggerAt: null,
      timezone: "Asia/Shanghai",
      toolAllowlist: [
        "resolve_news_source",
        "get_news_headlines",
        "send_channel_message",
      ],
      maxSteps: 5,
      timeoutMs: 120_000,
      channelTarget: {
        platform: "telegram",
        targetAlias: "dev-news",
        targetId: null,
      },
      deliverToConversation: false,
      input: {
        sourceQuery: "GitHub Trending",
      },
      conversationId: "conversation-1",
    });

    expect(blueprint).toEqual({
      version: 1,
      prompt:
        "Resolve GitHub Trending to its canonical NewsNow source, fetch the latest headlines, and send them to Telegram.",
      toolAllowlist: [
        "resolve_news_source",
        "get_news_headlines",
        "send_channel_message",
      ],
      maxSteps: 5,
      timeoutMs: 120000,
      deliveryIntent: {
        conversationId: null,
        channelTarget: {
          platform: "telegram",
          targetAlias: "dev-news",
          targetId: null,
        },
      },
      input: {
        sourceQuery: "GitHub Trending",
      },
    });
  });

  test("mergeScheduleBlueprintForUpdate keeps existing values and rewrites delivery targets", () => {
    const next = mergeScheduleBlueprintForUpdate({
      existing: {
        version: 1,
        prompt: "Old prompt",
        toolAllowlist: ["send_chat_message"],
        maxSteps: 3,
        timeoutMs: 60000,
        deliveryIntent: {
          conversationId: "conversation-1",
          channelTarget: null,
        },
        input: {
          a: 1,
        },
      },
      update: {
        scheduleId: "schedule-1",
        taskPrompt: "New prompt",
        deliverToConversation: false,
        channelTarget: {
          platform: "discord",
          targetAlias: "ops-room",
          targetId: null,
        },
      },
      context: {
        conversationId: "conversation-2",
      },
    });

    expect(next).toEqual({
      version: 1,
      prompt: "New prompt",
      toolAllowlist: ["send_chat_message"],
      maxSteps: 3,
      timeoutMs: 60000,
      deliveryIntent: {
        conversationId: null,
        channelTarget: {
          platform: "discord",
          targetAlias: "ops-room",
          targetId: null,
        },
      },
      input: {
        a: 1,
      },
    });
  });

  test("normalizeScheduleBlueprint rejects invalid stored values", () => {
    expect(normalizeScheduleBlueprint({
      version: 1,
      prompt: "ok",
      toolAllowlist: null,
      maxSteps: null,
      timeoutMs: null,
      deliveryIntent: null,
      input: null,
    })).not.toBeNull();

    expect(normalizeScheduleBlueprint({
      prompt: "missing version",
    })).toBeNull();
  });
});
