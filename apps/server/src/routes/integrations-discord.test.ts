import {
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { ResolveDiscordExternalConversationWindowResult } from "@neobuni/db";
import { Hono } from "hono";
import { generateKeyPairSync, sign } from "node:crypto";

const getMessagingIntegrationByPlatformAppIdMock = vi.fn(async () => ({
  id: "discord-integration-1",
  profileId: "profile-1",
  platform: "discord" as const,
  enabled: true,
  botToken: "",
  appId: "discord_app_123",
  appSecret: "",
  publicKey: "",
  webhookSecret: "",
  baseUrl: "",
  metadata: {},
  createdAt: "2026-06-15T00:00:00.000Z",
  updatedAt: "2026-06-15T00:00:00.000Z",
}));

const recordExternalEventReceiptMock = vi.fn(async () => ({
  inserted: true,
  receipt: {
    id: "receipt-1",
    profileId: "profile-1",
    platform: "discord" as const,
    eventId: "interaction-1",
    receivedAt: "2026-06-15T00:00:00.000Z",
  },
}));

const createResolvedWindow = (
  overrides: Partial<ResolveDiscordExternalConversationWindowResult> = {},
): ResolveDiscordExternalConversationWindowResult => ({
  conversationId: "conversation-new",
  lifecycle: "created",
  rolloverReason: null,
  previousConversationId: null,
  ...overrides,
});

const resolveDiscordExternalConversationWindowMock = vi.fn(
  async (): Promise<ResolveDiscordExternalConversationWindowResult> => createResolvedWindow(),
);
const runExternalMessageTurnMock = vi.fn(async () => ({
  assistantText: "今天的 AI 热点如下",
}));

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyHex = publicKey.export({
  type: "spki",
  format: "der",
}).toString("hex");

const signDiscordRequest = (input: {
  rawBody: string;
  timestamp: string;
}) =>
  sign(
    null,
    Buffer.from(`${input.timestamp}${input.rawBody}`, "utf8"),
    privateKey,
  ).toString("hex");

const { createDiscordIntegrationRoutes } = await import("./integrations-discord");
const app = new Hono().route("/v1/integrations/discord", createDiscordIntegrationRoutes({
  getMessagingIntegrationByPlatformAppId: getMessagingIntegrationByPlatformAppIdMock,
  recordExternalEventReceipt: recordExternalEventReceiptMock,
  resolveDiscordExternalConversationWindow: resolveDiscordExternalConversationWindowMock,
  runExternalMessageTurn: runExternalMessageTurnMock,
}));

describe("discord integration routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMessagingIntegrationByPlatformAppIdMock.mockResolvedValue({
      id: "discord-integration-1",
      profileId: "profile-1",
      platform: "discord" as const,
      enabled: true,
      botToken: "",
      appId: "discord_app_123",
      appSecret: "",
      publicKey: publicKeyHex,
      webhookSecret: "",
      baseUrl: "",
      metadata: {},
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:00.000Z",
    });
    recordExternalEventReceiptMock.mockResolvedValue({
      inserted: true,
      receipt: {
        id: "receipt-1",
        profileId: "profile-1",
        platform: "discord" as const,
        eventId: "interaction-1",
        receivedAt: "2026-06-15T00:00:00.000Z",
      },
    });
    resolveDiscordExternalConversationWindowMock.mockResolvedValue(createResolvedWindow());
    runExternalMessageTurnMock.mockResolvedValue({
      assistantText: "今天的 AI 热点如下",
    });
  });

  test("returns a Discord PING response after verifying the signature", async () => {
    const body = JSON.stringify({
      id: "interaction-1",
      application_id: "discord_app_123",
      type: 1,
    });
    const timestamp = "1718400000";
    const signature = signDiscordRequest({
      rawBody: body,
      timestamp,
    });

    const response = await app.request("/v1/integrations/discord/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature-ed25519": signature,
        "x-signature-timestamp": timestamp,
      },
      body,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 1 });
  });

  test("creates a hidden conversation binding and replies with the public_safe runtime output", async () => {
    const body = JSON.stringify({
      id: "interaction-1",
      application_id: "discord_app_123",
      type: 2,
      guild_id: "guild-1",
      channel_id: "channel-1",
      data: {
        name: "buni",
        options: [
          {
            name: "prompt",
            type: 3,
            value: "整理今天 AI 热点",
          },
        ],
      },
    });
    const timestamp = "1718400001";
    const signature = signDiscordRequest({
      rawBody: body,
      timestamp,
    });

    const response = await app.request("/v1/integrations/discord/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature-ed25519": signature,
        "x-signature-timestamp": timestamp,
      },
      body,
    });

    expect(response.status).toBe(200);
    expect(recordExternalEventReceiptMock).toHaveBeenCalledTimes(1);
    expect(resolveDiscordExternalConversationWindowMock).toHaveBeenCalledWith({
      profileId: "profile-1",
      scopeKey: "guild-1:channel-1",
    });
    expect(runExternalMessageTurnMock).toHaveBeenCalledWith({
      profileId: "profile-1",
      conversationId: "conversation-new",
      latestUserText: "整理今天 AI 热点",
      platform: "discord",
      externalThreadId: "interaction-1",
      clientTimezone: null,
    });
    expect(await response.json()).toEqual({
      type: 4,
      data: {
        content: "今天的 AI 热点如下",
      },
    });
  });

  test("reuses an existing resolved window instead of creating a new conversation manually", async () => {
    resolveDiscordExternalConversationWindowMock.mockResolvedValue(createResolvedWindow({
      conversationId: "conversation-existing",
      lifecycle: "reused",
    }));

    const body = JSON.stringify({
      id: "interaction-1",
      application_id: "discord_app_123",
      type: 2,
      guild_id: "guild-1",
      channel_id: "channel-1",
      data: {
        name: "buni",
        options: [
          {
            name: "prompt",
            type: 3,
            value: "整理今天 AI 热点",
          },
        ],
      },
    });
    const timestamp = "1718400003";
    const signature = signDiscordRequest({
      rawBody: body,
      timestamp,
    });

    const response = await app.request("/v1/integrations/discord/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature-ed25519": signature,
        "x-signature-timestamp": timestamp,
      },
      body,
    });

    expect(response.status).toBe(200);
    expect(resolveDiscordExternalConversationWindowMock).toHaveBeenCalledWith({
      profileId: "profile-1",
      scopeKey: "guild-1:channel-1",
    });
    expect(runExternalMessageTurnMock).toHaveBeenCalledWith({
      profileId: "profile-1",
      conversationId: "conversation-existing",
      latestUserText: "整理今天 AI 热点",
      platform: "discord",
      externalThreadId: "interaction-1",
      clientTimezone: null,
    });
  });

  test("rejects requests with an invalid Discord signature", async () => {
    const body = JSON.stringify({
      id: "interaction-1",
      application_id: "discord_app_123",
      type: 1,
    });

    const response = await app.request("/v1/integrations/discord/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature-ed25519": "deadbeef",
        "x-signature-timestamp": "1718400002",
      },
      body,
    });

    expect(response.status).toBe(401);
  });
});
