import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  listDiscordTargets,
  sendDiscordMessage,
} from "./discord";

const originalEnv = {
  botToken: process.env.NEOBUNI_DISCORD_BOT_TOKEN,
  appId: process.env.NEOBUNI_DISCORD_APP_ID,
  publicKey: process.env.NEOBUNI_DISCORD_PUBLIC_KEY,
  targetsJson: process.env.NEOBUNI_DISCORD_TARGETS_JSON,
};

const originalFetch = globalThis.fetch;

describe("discord integration", () => {
  beforeEach(() => {
    process.env.NEOBUNI_DISCORD_BOT_TOKEN = "discord_bot_token_123";
    process.env.NEOBUNI_DISCORD_APP_ID = "discord_app_123";
    process.env.NEOBUNI_DISCORD_PUBLIC_KEY = "a".repeat(64);
    process.env.NEOBUNI_DISCORD_TARGETS_JSON = JSON.stringify({
      friends_room: {
        label: "Friends Room",
        targetType: "channel",
        targetId: "123456789012345678",
      },
    });
  });

  afterEach(() => {
    process.env.NEOBUNI_DISCORD_BOT_TOKEN = originalEnv.botToken;
    process.env.NEOBUNI_DISCORD_APP_ID = originalEnv.appId;
    process.env.NEOBUNI_DISCORD_PUBLIC_KEY = originalEnv.publicKey;
    process.env.NEOBUNI_DISCORD_TARGETS_JSON = originalEnv.targetsJson;
    globalThis.fetch = originalFetch;
  });

  test("lists enabled discord targets from the configured environment", async () => {
    const targets = await listDiscordTargets("profile-discord-test-1");

    expect(targets).toEqual([
      {
        platform: "discord",
        targetAlias: "friends_room",
        targetId: "123456789012345678",
        label: "Friends Room",
      },
    ]);
  });

  test("sends a channel message through the configured target alias", async () => {
    const calls: Array<{
      url: string;
      method: string;
      body: string;
      headers: Record<string, string>;
    }> = [];

    globalThis.fetch = (async (input, init) => {
      const headers = Object.fromEntries(
        Object.entries(init?.headers ?? {}).map(([key, value]) => [
          key,
          String(value),
        ]),
      );

      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : "",
        headers,
      });

      return new Response(
        JSON.stringify({
          id: "discord_message_123",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }) as typeof fetch;

    const result = await sendDiscordMessage("profile-discord-test-1", {
      targetAlias: "friends_room",
      message: {
        type: "text",
        text: "top stories ready",
      },
    });

    expect(result.delivered).toBe(true);
    expect(result.messageId).toBe("discord_message_123");
    expect(result.target.platform).toBe("discord");
    expect(result.target.targetAlias).toBe("friends_room");
    expect(result.target.targetId).toBe("123456789012345678");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "https://discord.com/api/v10/channels/123456789012345678/messages",
    );
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.headers.Authorization).toBe("Bot discord_bot_token_123");
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
      content: "top stories ready",
    });
  });
});
