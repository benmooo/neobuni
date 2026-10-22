import { describe, expect, test } from "vitest";

import {
  getMessagingPlatformDescription,
  getMessagingTargetEmptyState,
  getMessagingTargetUsageHint,
  messagingSettingsCopy,
} from "./messaging-settings-copy";

describe("messaging settings copy", () => {
  test("exposes user-facing labels for target management", () => {
    expect(messagingSettingsCopy.targetCountLabel).toBe("目标数");
    expect(messagingSettingsCopy.targetsSectionTitle).toBe("发送目标");
    expect(messagingSettingsCopy.addTargetLabel).toBe("新增目标");
    expect(messagingSettingsCopy.targetAliasLabel).toBe("目标别名");
    expect(messagingSettingsCopy.targetTypeLabel).toBe("目标类型");
    expect(messagingSettingsCopy.targetIdLabel).toBe("目标 ID");
  });

  test("describes each platform without exposing internal tool names", () => {
    expect(getMessagingPlatformDescription("discord")).toContain("发送目标");
    expect(getMessagingPlatformDescription("telegram")).toContain("发送目标");
    expect(getMessagingPlatformDescription("feishu")).toContain("发送目标");
    expect(getMessagingPlatformDescription("qq")).toContain("发送目标");
  });

  test("uses user-facing target hints instead of tool ids", () => {
    expect(getMessagingTargetUsageHint("feishu")).toContain("消息发送和定时推送");
    expect(getMessagingTargetUsageHint("qq")).toContain("group_openid");
    expect(getMessagingTargetUsageHint("discord")).toContain("channel");
    expect(getMessagingTargetUsageHint("telegram")).toContain("topic");
    expect(getMessagingTargetUsageHint("feishu")).not.toContain("send_feishu_message");
    expect(getMessagingTargetUsageHint("qq")).not.toContain("send_qq_message");
  });

  test("renders a generic empty-state message with a platform-tailored follow-up", () => {
    expect(getMessagingTargetEmptyState("Discord 频道别名")).toBe(
      "还没有配置发送目标。你可以先保存凭证，后面再补上Discord 频道别名。",
    );
    expect(getMessagingTargetEmptyState("群聊或话题别名")).toBe(
      "还没有配置发送目标。你可以先保存凭证，后面再补上群聊或话题别名。",
    );
  });
});
