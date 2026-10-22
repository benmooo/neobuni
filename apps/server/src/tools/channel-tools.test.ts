import { beforeEach, describe, expect, test, vi } from "vitest";

const appendEventMock = vi.fn(async () => ({
  id: "event-1",
  profileId: "profile-1",
  type: "tool.test",
  payload: {},
  createdAt: "2026-06-15T00:00:00.000Z",
}));

const listChannelTargetsMock = vi.fn(async () => ({
  count: 1,
  items: [
    {
      platform: "discord" as const,
      targetAlias: "friends_room",
      targetId: "123456789012345678",
      label: "Friends Room",
    },
  ],
}));

const sendChannelMessageMock = vi.fn(async () => ({
  delivered: true,
  messageId: "discord_message_123",
  target: {
    platform: "discord" as const,
    targetAlias: "friends_room",
    targetId: "123456789012345678",
  },
  preview: "top stories ready",
}));

const createToolContext = () => ({
  profileId: "profile-1",
  conversationId: "conversation-1",
  turnId: "turn-1",
  clientTimezone: "Asia/Shanghai",
  profileTimezone: "Asia/Shanghai",
  defaultTimezone: "Asia/Shanghai",
  referenceNow: "2026-06-15T00:00:00.000Z",
  embeddingConfig: null,
  abortSignal: new AbortController().signal,
});

describe("channel tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("list_channel_targets returns the aggregated items and appends an event", async () => {
    const { createListChannelTargetsTool } = await import(
      "./list-channel-targets"
    );
    const tool = createListChannelTargetsTool(createToolContext(), {
      appendEvent: appendEventMock,
      listChannelTargets: listChannelTargetsMock,
    });

    if (!tool.execute) {
      throw new Error("Expected list_channel_targets tool.execute.");
    }

    const result = await tool.execute({
      platform: "discord",
    });

    expect(listChannelTargetsMock).toHaveBeenCalledTimes(1);
    expect(listChannelTargetsMock).toHaveBeenCalledWith("profile-1", "discord");
    expect(appendEventMock).toHaveBeenCalledTimes(1);
    expect(result.count).toBe(1);
    expect(result.items[0]?.targetAlias).toBe("friends_room");
  });

  test("send_channel_message delegates delivery and appends an event", async () => {
    const { createSendChannelMessageTool } = await import(
      "./send-channel-message"
    );
    const tool = createSendChannelMessageTool(createToolContext(), {
      appendEvent: appendEventMock,
      sendChannelMessage: sendChannelMessageMock,
    });

    if (!tool.execute) {
      throw new Error("Expected send_channel_message tool.execute.");
    }

    const result = await tool.execute({
      platform: "discord",
      targetAlias: "friends_room",
      message: {
        type: "text",
        text: "top stories ready",
      },
    });

    expect(sendChannelMessageMock).toHaveBeenCalledTimes(1);
    expect(appendEventMock).toHaveBeenCalledTimes(1);
    expect(result.delivered).toBe(true);
    expect(result.target.targetAlias).toBe("friends_room");
  });

  test("send_channel_message can omit platform and target identifiers when runtime can resolve them", async () => {
    const { createSendChannelMessageTool } = await import(
      "./send-channel-message"
    );
    const tool = createSendChannelMessageTool(createToolContext(), {
      appendEvent: appendEventMock,
      sendChannelMessage: sendChannelMessageMock,
    });

    if (!tool.execute) {
      throw new Error("Expected send_channel_message tool.execute.");
    }

    await tool.execute({
      message: {
        type: "text",
        text: "top stories ready",
      },
    });

    expect(sendChannelMessageMock).toHaveBeenCalledWith("profile-1", {
      message: {
        type: "text",
        text: "top stories ready",
      },
    });
  });
});
