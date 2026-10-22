import {
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

const resolveDiscordExternalConversationWindowMock = vi.fn(async () => ({
  conversationId: "conversation-new",
  lifecycle: "created" as const,
  rolloverReason: null,
  previousConversationId: null,
}));
const runExternalMessageTurnMock = vi.fn(async () => ({
  assistantText: "今天的 AI 热点如下",
}));
const recordExternalEventReceiptMock = vi.fn(async () => ({
  inserted: true,
  receipt: {
    id: "receipt-1",
  },
}));
const sendDiscordMessageMock = vi.fn(async () => ({
  delivered: true,
  messageId: "discord-message-1",
  target: {
    platform: "discord" as const,
    targetAlias: null,
    targetId: "channel-1",
  },
  preview: "今天的 AI 热点如下",
}));

describe("handleDiscordInboundMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveDiscordExternalConversationWindowMock.mockResolvedValue({
      conversationId: "conversation-new",
      lifecycle: "created",
      rolloverReason: null,
      previousConversationId: null,
    });
    runExternalMessageTurnMock.mockResolvedValue({
      assistantText: "今天的 AI 热点如下",
    });
    recordExternalEventReceiptMock.mockResolvedValue({
      inserted: true,
      receipt: {
        id: "receipt-1",
      },
    });
    sendDiscordMessageMock.mockResolvedValue({
      delivered: true,
      messageId: "discord-message-1",
      target: {
        platform: "discord",
        targetAlias: null,
        targetId: "channel-1",
      },
      preview: "今天的 AI 热点如下",
    });
  });

  test("dedupes, reuses the public-safe runtime path, and posts the reply back to the channel", async () => {
    const { handleDiscordInboundMessage } = await import("./discord-inbound");

    const result = await handleDiscordInboundMessage({
      profileId: "profile-1",
      inboundPrompt: {
        eventId: "message-1",
        scopeKey: "guild-1:channel-1",
        targetId: "channel-1",
        latestUserText: "整理今天 AI 热点",
      },
    }, {
      recordExternalEventReceipt: recordExternalEventReceiptMock as never,
      resolveDiscordExternalConversationWindow: resolveDiscordExternalConversationWindowMock as never,
      runExternalMessageTurn: runExternalMessageTurnMock as never,
      sendDiscordMessage: sendDiscordMessageMock as never,
    });

    expect(recordExternalEventReceiptMock).toHaveBeenCalledWith({
      profileId: "profile-1",
      platform: "discord",
      eventId: "message-1",
    });
    expect(resolveDiscordExternalConversationWindowMock).toHaveBeenCalledWith({
      profileId: "profile-1",
      scopeKey: "guild-1:channel-1",
    });
    expect(runExternalMessageTurnMock).toHaveBeenCalledWith({
      profileId: "profile-1",
      conversationId: "conversation-new",
      latestUserText: "整理今天 AI 热点",
      platform: "discord",
      externalThreadId: "message-1",
      clientTimezone: null,
    });
    expect(sendDiscordMessageMock).toHaveBeenCalledWith("profile-1", {
      targetId: "channel-1",
      message: {
        type: "text",
        text: "今天的 AI 热点如下",
      },
    });
    expect(result).toMatchObject({
      duplicate: false,
      delivered: true,
      assistantText: "今天的 AI 热点如下",
    });
  });
});
