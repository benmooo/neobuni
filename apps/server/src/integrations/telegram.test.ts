import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { listTelegramTargets, sendTelegramMessage } from "./telegram";

const originalEnv = {
  botToken: process.env.NEOBUNI_TELEGRAM_BOT_TOKEN,
  webhookSecret: process.env.NEOBUNI_TELEGRAM_WEBHOOK_SECRET,
  targetsJson: process.env.NEOBUNI_TELEGRAM_TARGETS_JSON,
};

const originalFetch = globalThis.fetch;

describe("telegram integration", () => {
  beforeEach(() => {
    process.env.NEOBUNI_TELEGRAM_BOT_TOKEN = "telegram_bot_token_123";
    process.env.NEOBUNI_TELEGRAM_WEBHOOK_SECRET = "telegram-secret";
    process.env.NEOBUNI_TELEGRAM_TARGETS_JSON = JSON.stringify({
      friends_topic: {
        label: "Friends Topic",
        targetType: "topic",
        targetId: "-1001234567890",
        metadata: {
          messageThreadId: 42,
        },
      },
    });
  });

  afterEach(() => {
    process.env.NEOBUNI_TELEGRAM_BOT_TOKEN = originalEnv.botToken;
    process.env.NEOBUNI_TELEGRAM_WEBHOOK_SECRET = originalEnv.webhookSecret;
    process.env.NEOBUNI_TELEGRAM_TARGETS_JSON = originalEnv.targetsJson;
    globalThis.fetch = originalFetch;
  });

  test("lists enabled telegram targets from the configured environment", async () => {
    const targets = await listTelegramTargets("profile-telegram-test-1");

    expect(targets).toEqual([
      {
        platform: "telegram",
        targetAlias: "friends_topic",
        targetId: "-1001234567890",
        label: "Friends Topic",
      },
    ]);
  });

  test("sends a telegram text message through the configured target alias", async () => {
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
        ])
      );

      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : "",
        headers,
      });

      return new Response(
        JSON.stringify({
          ok: true,
          result: {
            message_id: 987,
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }) as typeof fetch;

    const result = await sendTelegramMessage("profile-telegram-test-1", {
      targetAlias: "friends_topic",
      message: {
        type: "text",
        text: "top stories ready",
      },
      replyToMessageId: 77,
    });

    expect(result.delivered).toBe(true);
    expect(result.messageId).toBe("987");
    expect(result.target.platform).toBe("telegram");
    expect(result.target.targetAlias).toBe("friends_topic");
    expect(result.target.targetId).toBe("-1001234567890");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "https://api.telegram.org/bottelegram_bot_token_123/sendMessage"
    );
    expect(calls[0]?.method).toBe("POST");
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
      chat_id: "-1001234567890",
      text: "top stories ready",
      message_thread_id: 42,
      reply_parameters: {
        message_id: 77,
      },
    });
  });
});
