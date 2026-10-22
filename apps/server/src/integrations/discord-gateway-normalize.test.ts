import {
  describe,
  expect,
  test,
} from "vitest";

describe("normalizeDiscordGatewayMessage", () => {
  test("normalizes a mention message into a Discord inbound prompt", async () => {
    const { normalizeDiscordGatewayMessage } = await import("./discord-gateway-normalize");

    expect(normalizeDiscordGatewayMessage({
      applicationId: "discord_app_123",
      event: {
        id: "message-1",
        guild_id: "guild-1",
        channel_id: "channel-1",
        content: "<@discord_app_123> 整理今天 AI 热点",
        author: {
          id: "user-1",
          bot: false,
        },
        mentions: [
          {
            id: "discord_app_123",
            bot: true,
          },
        ],
      },
    })).toEqual({
      eventId: "message-1",
      scopeKey: "guild-1:channel-1",
      targetId: "channel-1",
      latestUserText: "整理今天 AI 热点",
    });
  });

  test("normalizes a reply-to-bot message even without a direct mention", async () => {
    const { normalizeDiscordGatewayMessage } = await import("./discord-gateway-normalize");

    expect(normalizeDiscordGatewayMessage({
      applicationId: "discord_app_123",
      event: {
        id: "message-2",
        guild_id: "guild-1",
        channel_id: "channel-1",
        content: "总结这个频道最近的聊天",
        author: {
          id: "user-2",
          bot: false,
        },
        referenced_message: {
          author: {
            id: "discord_app_123",
            bot: true,
          },
        },
      },
    })).toEqual({
      eventId: "message-2",
      scopeKey: "guild-1:channel-1",
      targetId: "channel-1",
      latestUserText: "总结这个频道最近的聊天",
    });
  });
});
