import { describe, expect, test } from "vitest";

import { resolveChannelAlias } from "./channel-draft";

describe("resolveChannelAlias", () => {
  test("uses the free-text alias when Telegram has no bound targets", () => {
    expect(
      resolveChannelAlias({
        alias: " ruankao0 ",
        hasTelegramTargets: false,
        platform: "telegram",
        selectedTarget: "",
      })
    ).toBe("ruankao0");
  });

  test("uses the picker value when Telegram targets exist", () => {
    expect(
      resolveChannelAlias({
        alias: "typed-but-not-rendered",
        hasTelegramTargets: true,
        platform: "telegram",
        selectedTarget: "ruankao0",
      })
    ).toBe("ruankao0");
  });

  test("uses the free-text alias for every other platform", () => {
    expect(
      resolveChannelAlias({
        alias: "discord-channel",
        hasTelegramTargets: true,
        platform: "discord",
        selectedTarget: "stale",
      })
    ).toBe("discord-channel");
  });
});
