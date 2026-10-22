import { describe, expect, test } from "vitest";

import { scheduleDeliveryIntentSchema } from "./schedule";
import { sendChannelMessageInputSchema } from "./send-channel-message";

describe("channel delivery contracts", () => {
  test("parses a schedule delivery intent with a generic channel target", () => {
    const parsed = scheduleDeliveryIntentSchema.parse({
      conversationId: null,
      channelTarget: {
        platform: "telegram",
        targetAlias: "friends-group",
        targetId: null,
      },
    });

    expect(parsed.channelTarget?.platform).toBe("telegram");
  });

  test("allows send_channel_message inputs to rely on runtime target resolution", () => {
    const withoutTarget = sendChannelMessageInputSchema.parse({
      message: { type: "text", text: "hello" },
    });
    const aliasWithoutPlatform = sendChannelMessageInputSchema.parse({
      targetAlias: "friends-room",
      message: { type: "text", text: "hello" },
    });

    expect(withoutTarget).toEqual({
      message: { type: "text", text: "hello" },
    });
    expect(aliasWithoutPlatform).toEqual({
      targetAlias: "friends-room",
      message: { type: "text", text: "hello" },
    });
  });
});
