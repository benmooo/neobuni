import { Hono } from "hono";
import { beforeEach, describe, expect, test, vi } from "vitest";

interface TelegramStoredIntegration {
  appId: string;
  appSecret: string;
  baseUrl: string;
  botToken: string;
  createdAt: string;
  enabled: boolean;
  id: string;
  metadata: Record<string, unknown>;
  platform: "telegram";
  profileId: string;
  publicKey: string;
  updatedAt: string;
  webhookSecret: string;
}

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
    _webhookSecret?: string
  ): Promise<TelegramStoredIntegration | null> => buildTelegramIntegration()
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

const getExternalConversationBindingMock = vi.fn(
  async () =>
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
    }
);

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

const { createTelegramIntegrationRoutes } = await import(
  "./integrations-telegram"
);
const app = new Hono().route(
  "/v1/integrations/telegram",
  createTelegramIntegrationRoutes({
    getMessagingIntegrationByWebhookSecret:
      getMessagingIntegrationByWebhookSecretMock,
    recordExternalEventReceipt: recordExternalEventReceiptMock,
    getExternalConversationBinding: getExternalConversationBindingMock,
    createExternalConversationBinding: createExternalConversationBindingMock,
    touchExternalConversationBinding: touchExternalConversationBindingMock,
    createConversation: createConversationMock,
    runExternalMessageTurn: runExternalMessageTurnMock,
    sendTelegramMessage: sendTelegramMessageMock,
  })
);

describe("telegram integration routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMessagingIntegrationByWebhookSecretMock.mockImplementation(
      async (
        _platform?: string,
        webhookSecret?: string
      ): Promise<TelegramStoredIntegration | null> =>
        webhookSecret === "telegram-secret" ? buildTelegramIntegration() : null
    );
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
          id: -1_001_234_567_890,
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
          id: -1_001_234_567_890,
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
          id: -1_001_234_567_890,
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
          id: -1_001_234_567_890,
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

describe("telegram nudge interactions", () => {
  const answerTelegramCallbackQueryMock = vi.fn(async () => undefined);
  const applyStudyNudgeActionMock = vi.fn(async () => ({
    ack: "已记录",
    text: "已改到明晚 20:30",
  }));
  const bindStudyGoalChannelMock = vi.fn(async () => ({
    bound: true,
    channels: [],
  }));
  const editTelegramMessageTextMock = vi.fn(async () => undefined);
  const applyStudyScoutActionMock = vi.fn(
    async (_input?: {
      action: string;
      digestId: string;
      index: number;
      profileId: string;
    }) => ({ ack: "已收藏到知识库。", text: "已收藏：Quality attributes" })
  );

  const nudgeApp = new Hono().route(
    "/v1/integrations/telegram",
    createTelegramIntegrationRoutes({
      answerTelegramCallbackQuery: answerTelegramCallbackQueryMock,
      applyStudyNudgeAction: applyStudyNudgeActionMock,
      applyStudyScoutAction: applyStudyScoutActionMock,
      bindStudyGoalChannel: bindStudyGoalChannelMock,
      createConversation: createConversationMock,
      createExternalConversationBinding: createExternalConversationBindingMock,
      editTelegramMessageText: editTelegramMessageTextMock,
      getExternalConversationBinding: getExternalConversationBindingMock,
      getMessagingIntegrationByWebhookSecret:
        getMessagingIntegrationByWebhookSecretMock,
      recordExternalEventReceipt: recordExternalEventReceiptMock,
      runExternalMessageTurn: runExternalMessageTurnMock,
      sendTelegramMessage: sendTelegramMessageMock,
      touchExternalConversationBinding: touchExternalConversationBindingMock,
    })
  );

  const post = (body: unknown, secret = "telegram-secret") =>
    nudgeApp.request("/v1/integrations/telegram/events", {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": secret,
      },
      method: "POST",
    });

  beforeEach(() => {
    vi.clearAllMocks();
    getMessagingIntegrationByWebhookSecretMock.mockImplementation(
      async (_platform?: string, webhookSecret?: string) =>
        webhookSecret === "telegram-secret" ? buildTelegramIntegration() : null
    );
    recordExternalEventReceiptMock.mockResolvedValue({
      inserted: true,
      receipt: {
        eventId: "2001",
        id: "receipt-2",
        platform: "telegram" as const,
        profileId: "profile-1",
        receivedAt: "2026-06-15T00:00:00.000Z",
      },
    });
    applyStudyNudgeActionMock.mockResolvedValue({
      ack: "已记录",
      text: "已改到明晚 20:30",
    });
    bindStudyGoalChannelMock.mockResolvedValue({ bound: true, channels: [] });
  });

  test("applies a nudge button and rewrites the message", async () => {
    const response = await post({
      callback_query: {
        data: "st:tomorrow:session-1",
        from: { id: 42 },
        id: "callback-1",
        message: {
          chat: { id: 42, type: "private" },
          message_id: 777,
          text: "20:30 · Quality attributes",
        },
      },
      update_id: 2001,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      acted: true,
      ok: true,
    });
    expect(applyStudyNudgeActionMock).toHaveBeenCalledWith({
      action: "tomorrow",
      profileId: "profile-1",
      sessionId: "session-1",
    });
    expect(answerTelegramCallbackQueryMock).toHaveBeenCalledWith("profile-1", {
      callbackQueryId: "callback-1",
      text: "已记录",
    });
    expect(editTelegramMessageTextMock).toHaveBeenCalledWith("profile-1", {
      messageId: "777",
      targetId: "42",
      text: "已改到明晚 20:30",
    });
    expect(runExternalMessageTurnMock).not.toHaveBeenCalled();
  });

  test("routes a scout save button to the scout actions", async () => {
    const response = await post({
      callback_query: {
        data: "sc:save:1:ab12cd34",
        from: { id: 42 },
        id: "callback-2",
        message: {
          chat: { id: 42, type: "private" },
          message_id: 778,
          text: "📚 今日精选材料 · 2 条",
        },
      },
      update_id: 3001,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ acted: true, ok: true });
    expect(applyStudyScoutActionMock).toHaveBeenCalledWith({
      action: "save",
      digestId: "ab12cd34",
      index: 1,
      profileId: "profile-1",
    });
    expect(applyStudyNudgeActionMock).not.toHaveBeenCalled();
    expect(answerTelegramCallbackQueryMock).toHaveBeenCalledWith("profile-1", {
      callbackQueryId: "callback-2",
      text: "已收藏到知识库。",
    });
    expect(editTelegramMessageTextMock).toHaveBeenCalledWith("profile-1", {
      messageId: "778",
      targetId: "42",
      text: "已收藏：Quality attributes",
    });
  });

  test.each([
    ["sc:quiz:0:ab12cd34", "quiz"],
    ["sc:skip:2:ab12cd34", "skip"],
    ["sc:later:0:ab12cd34", "later"],
  ])("routes %s to the scout actions", async (data, action) => {
    const response = await post({
      callback_query: {
        data,
        from: { id: 42 },
        id: "callback-3",
        message: {
          chat: { id: 42, type: "private" },
          message_id: 779,
        },
      },
      update_id: 3002,
    });

    expect(response.status).toBe(200);
    expect(applyStudyScoutActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ action, digestId: "ab12cd34" })
    );
  });

  test("ignores malformed scout buttons", async () => {
    const response = await post({
      callback_query: {
        data: "sc:save:0:",
        from: { id: 42 },
        id: "callback-4",
        message: { chat: { id: 42, type: "private" }, message_id: 780 },
      },
      update_id: 3003,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ignored: true, ok: true });
    expect(applyStudyScoutActionMock).not.toHaveBeenCalled();
  });

  test("binds the chat when the start payload carries a study goal", async () => {
    const response = await post({
      message: {
        chat: { id: 42, type: "private" },
        message_id: 2002,
        text: "/start bunistudy_goal-123456",
      },
      update_id: 2002,
    });

    expect(response.status).toBe(200);
    expect(bindStudyGoalChannelMock).toHaveBeenCalledWith({
      chatId: "42",
      goalId: "goal-123456",
      profileId: "profile-1",
    });
    expect(sendTelegramMessageMock).toHaveBeenCalledWith(
      "profile-1",
      expect.objectContaining({
        message: { text: expect.stringContaining("已绑定"), type: "text" },
      })
    );
    expect(runExternalMessageTurnMock).not.toHaveBeenCalled();
  });
});
