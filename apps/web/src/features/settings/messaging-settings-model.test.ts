import { describe, expect, test } from "vitest";

import {
  createMessagingTargetDraft,
  getMessagingConfigSourceLabel,
  readMessageThreadIdInput,
  stripMessagingTargetClientId,
  toMessagingTargetDrafts,
  writeMessageThreadIdMetadata,
} from "./messaging-settings-model";

describe("messaging settings model", () => {
  test("labels messaging config sources for settings summary chips", () => {
    expect(getMessagingConfigSourceLabel("database")).toBe("数据库");
    expect(getMessagingConfigSourceLabel("env")).toBe("环境变量回退");
    expect(getMessagingConfigSourceLabel("default")).toBe("未配置");
  });

  test("creates draft targets with client ids and strips them back to contract input", () => {
    const drafts = toMessagingTargetDrafts([
      {
        alias: "friends",
        label: "Friends Group",
        targetType: "group",
        targetId: "-1001234567890",
        enabled: true,
        metadata: {
          note: "weekend",
        },
      },
    ]);

    expect(drafts).toHaveLength(1);
    expect(typeof drafts[0]?.clientId).toBe("string");
    expect((drafts[0]?.clientId ?? "").length > 0).toBe(true);
    expect(stripMessagingTargetClientId(drafts[0]!)).toEqual({
      alias: "friends",
      label: "Friends Group",
      targetType: "group",
      targetId: "-1001234567890",
      enabled: true,
      metadata: {
        note: "weekend",
      },
    });
  });

  test("maps telegram topic thread ids into metadata only when present", () => {
    expect(readMessageThreadIdInput({ messageThreadId: 42 })).toBe("42");
    expect(readMessageThreadIdInput({ messageThreadId: "99" })).toBe("99");
    expect(readMessageThreadIdInput({ note: "none" })).toBe("");

    expect(writeMessageThreadIdMetadata({ note: "keep" }, "")).toEqual({
      note: "keep",
    });
    expect(writeMessageThreadIdMetadata({ note: "keep" }, "314")).toEqual({
      note: "keep",
      messageThreadId: 314,
    });
  });

  test("creates empty target drafts with defaults for new rows", () => {
    expect(createMessagingTargetDraft()).toMatchObject({
      alias: "",
      label: "",
      targetType: "channel",
      targetId: "",
      enabled: true,
      metadata: {},
    });
  });
});
