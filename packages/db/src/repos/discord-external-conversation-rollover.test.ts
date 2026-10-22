import { describe, expect, test } from "vitest";

describe("discord external conversation rollover core", () => {
  test("returns message_count when the window reaches the max message threshold", async () => {
    const {
      decideDiscordExternalConversationRollover,
      DISCORD_EXTERNAL_CONVERSATION_ROLLOVER_LIMITS,
    } = await import("./discord-external-conversation-rollover");

    expect(
      decideDiscordExternalConversationRollover({
        stats: {
          messageCount:
            DISCORD_EXTERNAL_CONVERSATION_ROLLOVER_LIMITS.maxWindowMessageCount,
          totalContentChars: 100,
          estimatedTokens: 25,
          lastMessageAt: "2026-07-02T08:00:00.000Z",
        },
        now: "2026-07-02T08:00:01.000Z",
      })
    ).toEqual({
      shouldRollover: true,
      reason: "message_count",
    });
  });

  test("returns estimated_tokens when the token estimate reaches the max token threshold", async () => {
    const {
      decideDiscordExternalConversationRollover,
      DISCORD_EXTERNAL_CONVERSATION_ROLLOVER_LIMITS,
    } = await import("./discord-external-conversation-rollover");

    expect(
      decideDiscordExternalConversationRollover({
        stats: {
          messageCount: 10,
          totalContentChars: 96_000,
          estimatedTokens:
            DISCORD_EXTERNAL_CONVERSATION_ROLLOVER_LIMITS.maxWindowEstimatedTokens,
          lastMessageAt: "2026-07-02T08:00:00.000Z",
        },
        now: "2026-07-02T08:00:01.000Z",
      })
    ).toEqual({
      shouldRollover: true,
      reason: "estimated_tokens",
    });
  });

  test("returns idle when the last message is older than the idle threshold", async () => {
    const {
      decideDiscordExternalConversationRollover,
      DISCORD_EXTERNAL_CONVERSATION_ROLLOVER_LIMITS,
    } = await import("./discord-external-conversation-rollover");

    expect(
      decideDiscordExternalConversationRollover({
        stats: {
          messageCount: 10,
          totalContentChars: 100,
          estimatedTokens: 25,
          lastMessageAt: "2026-07-01T08:00:00.000Z",
        },
        now: new Date(
          Date.parse("2026-07-01T08:00:00.000Z") +
            DISCORD_EXTERNAL_CONVERSATION_ROLLOVER_LIMITS.maxWindowIdleMs
        ).toISOString(),
      })
    ).toEqual({
      shouldRollover: true,
      reason: "idle",
    });
  });

  test("keeps the active window when no threshold is reached", async () => {
    const { decideDiscordExternalConversationRollover } = await import(
      "./discord-external-conversation-rollover"
    );

    expect(
      decideDiscordExternalConversationRollover({
        stats: {
          messageCount: 10,
          totalContentChars: 100,
          estimatedTokens: 25,
          lastMessageAt: "2026-07-02T08:00:00.000Z",
        },
        now: "2026-07-02T08:00:01.000Z",
      })
    ).toEqual({
      shouldRollover: false,
      reason: null,
    });
  });

  test("selects the latest non-system seed messages and preserves order", async () => {
    const { selectDiscordExternalConversationSeedMessages } = await import(
      "./discord-external-conversation-rollover"
    );

    expect(
      selectDiscordExternalConversationSeedMessages({
        messages: [
          {
            id: "m1",
            role: "system",
            kind: "text",
            content: "sys",
            metadata: {},
            createdAt: "2026-07-02T08:00:00.000Z",
          },
          {
            id: "m2",
            role: "user",
            kind: "text",
            content: "u1",
            metadata: {},
            createdAt: "2026-07-02T08:01:00.000Z",
          },
          {
            id: "m3",
            role: "assistant",
            kind: "generated",
            content: "a1",
            metadata: {},
            createdAt: "2026-07-02T08:02:00.000Z",
          },
          {
            id: "m4",
            role: "user",
            kind: "text",
            content: "u2",
            metadata: {},
            createdAt: "2026-07-02T08:03:00.000Z",
          },
        ],
        seedMessageCount: 2,
      }).map((message) => message.id)
    ).toEqual(["m3", "m4"]);
  });
});
