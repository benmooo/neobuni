import type { MessagingPlatform } from "@neobuni/contracts";

const messagingSettingsCopy = {
  targetCountLabel: "目标数",
  targetsSectionTitle: "发送目标",
  addTargetLabel: "新增目标",
  targetAliasLabel: "目标别名",
  targetTypeLabel: "目标类型",
  targetIdLabel: "目标 ID",
} as const;

const getMessagingPlatformDescription = (platform: MessagingPlatform) => {
  if (platform === "discord") {
    return "配置 Discord bot 入口和可复用的发送目标。";
  }

  if (platform === "telegram") {
    return "配置 Telegram bot 入口和可复用的群聊 / topic 发送目标。";
  }

  if (platform === "feishu") {
    return "配置飞书发送凭证和可复用的发送目标。";
  }

  return "配置 QQ 机器人发送凭证和可复用的发送目标。";
};

const getMessagingTargetUsageHint = (platform: MessagingPlatform) => {
  if (platform === "discord") {
    return "目标别名用于消息发送和定时推送。Discord Phase 1 推荐直接配置 channel / thread id。";
  }

  if (platform === "telegram") {
    return "目标别名用于消息发送和定时推送。配置 topic 时，需要保留群 chat id，并额外填写 topic thread id。";
  }

  if (platform === "feishu") {
    return "目标别名用于消息发送和定时推送。配置后，Buni 可以把消息发到对应的群聊或会话。";
  }

  return "目标别名用于消息发送和定时推送。当前支持 group_openid 和 user_openid 两种目标。";
};

const getMessagingTargetEmptyState = (followUp: string) =>
  `还没有配置发送目标。你可以先保存凭证，后面再补上${followUp}。`;

export {
  getMessagingPlatformDescription,
  getMessagingTargetEmptyState,
  getMessagingTargetUsageHint,
  messagingSettingsCopy,
};
