import {
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { Hono } from "hono";

type TelegramStoredIntegration = {
  id: string;
  profileId: string;
  platform: "telegram";
  enabled: boolean;
  botToken: string;
  appId: string;
  appSecret: string;
  publicKey: string;
  webhookSecret: string;
  baseUrl: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

const buildTelegramIntegration = (): TelegramStoredIntegration => ({
  id: "telegram-integration-1",
  profileId: "profile-1",
  platform: "telegram" as const,
  enabled: true,
  botToken: "telegram_bot_token_123",
  appId: "",
  appSecret: "",
  publicKey: "",
  webhookSecret: "telegram-secret",
  baseUrl: "",
  metadata: {
    botUsername: "buni_bot",
  },
  createdAt: "2026-06-15T00:00:00.000Z",
  updatedAt: "2026-06-15T00:00:00.000Z",
});

const getMessagingIntegrationByWebhookSecretMock = vi.fn(
  async (
    _platform?: string,
    _webhookSecret?: string,
  ): Promise<TelegramStoredIntegration | null> => buildTelegramIntegration(),
);

const recordExternalEventReceiptMock = vi.fn(async () => ({
  inserted: true,
  receipt: {
    id: "receipt-1",
    profileId: "profile-1",
    platform: "telegram" as const,
    eventId: "1001",
    receivedAt: "2026-06-15T00:00:00.000Z",
  },
}));

const getExternalConversationBindingMock = vi.fn(async () =>
  null as null | {
    id: string;
    profileId: string;
    platform: "telegram";
    scopeType: "telegram_chat";
    scopeKey: string;
    conversationId: string;
    lastInboundAt: string | null;
    createdAt: string;
    updatedAt: string;
  });

const createExternalConversationBindingMock = vi.fn(async () => ({
  id: "binding-1",
  profileId: "profile-1",
  platform: "telegram" as const,
  scopeType: "telegram_chat" as const,
  scopeKey: "-1001234567890",
  conversationId: "conversation-new",
  lastInboundAt: null,
  createdAt: "2026-06-15T00:00:00.000Z",
  updatedAt: "2026-06-15T00:00:00.000Z",
}));

const touchExternalConversationBindingMock = vi.fn(async () => ({
  id: "binding-1",
  profileId: "profile-1",
  platform: "telegram" as const,
  scopeType: "telegram_chat" as const,
  scopeKey: "-1001234567890",
  conversationId: "conversation-new",
  lastInboundAt: "2026-06-15T00:01:00.000Z",
  createdAt: "2026-06-15T00:00:00.000Z",
  updatedAt: "2026-06-15T00:01:00.000Z",
}));

const createConversationMock = vi.fn(async () => ({
  id: "conversation-new",
  profileId: "profile-1",
  title: "[telegram] -1001234567890",
  modelKey: "default",
  hidden: true,
  status: "active" as const,
  createdAt: "2026-06-15T00:00:00.000Z",
  updatedAt: "2026-06-15T00:00:00.000Z",
}));

const runExternalMessageTurnMock = vi.fn(async () => ({
  assistantText: "今天的 AI 热点如下",
}));

const sendTelegramMessageMock = vi.fn(async () => ({
  delivered: true,
  messageId: "987",
  target: {
    platform: "telegram" as const,
    targetAlias: null,
    targetId: "-1001234567890",
  },
  preview: "今天的 AI 热点如下",
}));

const { createTelegramIntegrationRoutes } = await import("./integrations-telegram");
const app = new Hono().route("/v1/integrations/telegram", createTelegramIntegrationRoutes({
  getMessagingIntegrationByWebhookSecret: getMessagingIntegrationByWebhookSecretMock,
  recordExternalEventReceipt: recordExternalEventReceiptMock,
  getExternalConversationBinding: getExternalConversationBindingMock,
  createExternalConversationBinding: createExternalConversationBindingMock,
  touchExternalConversationBinding: touchExternalConversationBindingMock,
  createConversation: createConversationMock,
  runExternalMessageTurn: runExternalMessageTurnMock,
  sendTelegramMessage: sendTelegramMessageMock,
}));

describe("telegram integration routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMessagingIntegrationByWebhookSecretMock.mockImplementation(async (
      _platform?: string,
      webhookSecret?: string,
    ): Promise<TelegramStoredIntegration | null> =>
      webhookSecret === "telegram-secret"
        ? buildTelegramIntegration()
        : null);
    recordExternalEventReceiptMock.mockResolvedValue({
      inserted: true,
      receipt: {
        id: "receipt-1",
        profileId: "profile-1",
        platform: "telegram" as const,
        eventId: "1001",
        receivedAt: "2026-06-15T00:00:00.000Z",
      },
    });
    getExternalConversationBindingMock.mockResolvedValue(null);
    createExternalConversationBindingMock.mockResolvedValue({
      id: "binding-1",
      profileId: "profile-1",
      platform: "telegram" as const,
      scopeType: "telegram_chat" as const,
      scopeKey: "-1001234567890",
      conversationId: "conversation-new",
      lastInboundAt: null,
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:00.000Z",
    });
    touchExternalConversationBindingMock.mockResolvedValue({
      id: "binding-1",
      profileId: "profile-1",
      platform: "telegram" as const,
      scopeType: "telegram_chat" as const,
      scopeKey: "-1001234567890",
      conversationId: "conversation-new",
      lastInboundAt: "2026-06-15T00:01:00.000Z",
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:01:00.000Z",
    });
    createConversationMock.mockResolvedValue({
      id: "conversation-new",
      profileId: "profile-1",
      title: "[telegram] -1001234567890",
      modelKey: "default",
      hidden: true,
      status: "active" as const,
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:00.000Z",
    });
    runExternalMessageTurnMock.mockResolvedValue({
      assistantText: "今天的 AI 热点如下",
    });
    sendTelegramMessageMock.mockResolvedValue({
      delivered: true,
      messageId: "987",
      target: {
        platform: "telegram" as const,
        targetAlias: null,
        targetId: "-1001234567890",
      },
      preview: "今天的 AI 热点如下",
    });
  });

  test("creates a hidden conversation binding and replies to a /buni command", async () => {
    const body = JSON.stringify({
      update_id: 1001,
      message: {
        message_id: 2001,
        text: "/buni 整理今天 AI 热点",
        chat: {
          id: -1001234567890,
          type: "supergroup",
          title: "Friends Room",
        },
      },
    });

    const response = await app.request("/v1/integrations/telegram/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "telegram-secret",
      },
      body,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(createConversationMock).toHaveBeenCalledWith("profile-1", {
      title: "[telegram] -1001234567890",
      modelKey: "default",
      hidden: true,
    });
    expect(createExternalConversationBindingMock).toHaveBeenCalledWith({
      profileId: "profile-1",
      platform: "telegram",
      scopeType: "telegram_chat",
      scopeKey: "-1001234567890",
      conversationId: "conversation-new",
    });
    expect(runExternalMessageTurnMock).toHaveBeenCalledWith({
      profileId: "profile-1",
      conversationId: "conversation-new",
      latestUserText: "整理今天 AI 热点",
      platform: "telegram",
      externalThreadId: "1001",
      clientTimezone: null,
    });
    expect(sendTelegramMessageMock).toHaveBeenCalledWith("profile-1", {
      targetId: "-1001234567890",
      message: {
        type: "text",
        text: "今天的 AI 热点如下",
      },
      replyToMessageId: 2001,
    });
  });

  test("reuses an existing binding for reply-to-bot messages", async () => {
    getExternalConversationBindingMock.mockResolvedValue({
      id: "binding-existing",
      profileId: "profile-1",
      platform: "telegram" as const,
      scopeType: "telegram_chat" as const,
      scopeKey: "-1001234567890",
      conversationId: "conversation-existing",
      lastInboundAt: null,
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:00.000Z",
    });

    const body = JSON.stringify({
      update_id: 1002,
      message: {
        message_id: 2002,
        text: "继续展开第二条",
        chat: {
          id: -1001234567890,
          type: "supergroup",
          title: "Friends Room",
        },
        reply_to_message: {
          message_id: 2000,
          from: {
            is_bot: true,
            username: "buni_bot",
          },
        },
      },
    });

    const response = await app.request("/v1/integrations/telegram/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "telegram-secret",
      },
      body,
    });

    expect(response.status).toBe(200);
    expect(createConversationMock).toHaveBeenCalledTimes(0);
    expect(createExternalConversationBindingMock).toHaveBeenCalledTimes(0);
    expect(runExternalMessageTurnMock).toHaveBeenCalledWith({
      profileId: "profile-1",
      conversationId: "conversation-existing",
      latestUserText: "继续展开第二条",
      platform: "telegram",
      externalThreadId: "1002",
      clientTimezone: null,
    });
  });

  test("ignores non-command group messages that are not replies to the bot", async () => {
    const body = JSON.stringify({
      update_id: 1003,
      message: {
        message_id: 2003,
        text: "hello everyone",
        chat: {
          id: -1001234567890,
          type: "supergroup",
          title: "Friends Room",
        },
      },
    });

    const response = await app.request("/v1/integrations/telegram/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "telegram-secret",
      },
      body,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      ignored: true,
    });
    expect(runExternalMessageTurnMock).toHaveBeenCalledTimes(0);
    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(0);
  });

  test("rejects requests with an invalid Telegram secret token", async () => {
    const body = JSON.stringify({
      update_id: 1004,
      message: {
        message_id: 2004,
        text: "/buni test",
        chat: {
          id: -1001234567890,
          type: "supergroup",
        },
      },
    });

    const response = await app.request("/v1/integrations/telegram/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "wrong-secret",
      },
      body,
    });

    expect(response.status).toBe(404);
  });
});
