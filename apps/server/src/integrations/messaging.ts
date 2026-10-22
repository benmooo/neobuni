import type {
  ChannelPlatform,
  ListChannelTargetsOutput,
  SendChannelMessageInput,
  SendChannelMessageOutput,
} from "@neobuni/contracts";
import { listDiscordTargets, sendDiscordMessage } from "./discord";
import { getEffectiveFeishuConfig, sendFeishuMessage } from "./feishu";
import { getEffectiveQqConfig, sendQqMessage } from "./qq";
import { listTelegramTargets, sendTelegramMessage } from "./telegram";

type ChannelTargetRecord = ListChannelTargetsOutput["items"][number];

const toFeishuTargets = async (
  profileId: string
): Promise<ChannelTargetRecord[]> => {
  const config = await getEffectiveFeishuConfig(profileId);

  return config.targets
    .filter((target) => target.enabled)
    .map((target) => ({
      platform: "feishu" as const,
      targetAlias: target.alias,
      targetId: target.receiveId,
      label: target.label.trim().length > 0 ? target.label : null,
    }));
};

const toQqTargets = async (
  profileId: string
): Promise<ChannelTargetRecord[]> => {
  const config = await getEffectiveQqConfig(profileId);

  return config.targets
    .filter((target) => target.enabled)
    .map((target) => ({
      platform: "qq" as const,
      targetAlias: target.alias,
      targetId: target.targetId,
      label: target.label.trim().length > 0 ? target.label : null,
    }));
};

const listChannelTargets = async (
  profileId: string,
  platform?: ChannelPlatform
): Promise<ListChannelTargetsOutput> => {
  const items = await (async () => {
    if (platform === "discord") {
      return await listDiscordTargets(profileId);
    }

    if (platform === "feishu") {
      return await toFeishuTargets(profileId);
    }

    if (platform === "qq") {
      return await toQqTargets(profileId);
    }

    if (platform === "telegram") {
      return await listTelegramTargets(profileId);
    }

    const [discordTargets, telegramTargets, feishuTargets, qqTargets] =
      await Promise.all([
        listDiscordTargets(profileId),
        listTelegramTargets(profileId),
        toFeishuTargets(profileId),
        toQqTargets(profileId),
      ]);

    return [
      ...discordTargets,
      ...telegramTargets,
      ...feishuTargets,
      ...qqTargets,
    ];
  })();

  return {
    count: items.length,
    items,
  };
};

const findMatchingConfiguredTarget = async (input: {
  profileId: string;
  platform?: ChannelPlatform;
  targetAlias?: string;
  targetId?: string;
}) => {
  const targets = await listChannelTargets(input.profileId, input.platform);
  const matchingTargets = targets.items.filter((target) => {
    const aliasMatches =
      input.targetAlias === undefined ||
      target.targetAlias === input.targetAlias;
    const idMatches =
      input.targetId === undefined || target.targetId === input.targetId;

    return aliasMatches && idMatches;
  });

  if (matchingTargets.length === 1) {
    return matchingTargets[0] ?? null;
  }

  if (matchingTargets.length > 1) {
    throw new Error(
      "Multiple channel targets matched. Pass a platform or a more specific target alias."
    );
  }

  return null;
};

const sendChannelMessage = async (
  profileId: string,
  input: SendChannelMessageInput
): Promise<SendChannelMessageOutput> => {
  if (input.platform === "discord") {
    return await sendDiscordMessage(profileId, input);
  }

  if (input.platform === "telegram") {
    return await sendTelegramMessage(profileId, input);
  }

  const selection = await findMatchingConfiguredTarget({
    profileId,
    platform: input.platform,
    targetAlias: input.targetAlias,
    targetId: input.targetId,
  });

  if (!selection) {
    throw new Error("No configured channel target matched the request.");
  }

  if (selection.platform === "discord") {
    return await sendDiscordMessage(profileId, {
      targetAlias: selection.targetAlias ?? undefined,
      targetId: selection.targetId ?? undefined,
      message: input.message,
    });
  }

  if (selection.platform === "feishu") {
    const result = await sendFeishuMessage(profileId, {
      targetAlias: selection.targetAlias ?? undefined,
      message: {
        type: "text",
        text: input.message.text,
      },
    });

    return {
      delivered: result.delivered,
      messageId: result.messageId,
      target: {
        platform: "feishu",
        targetAlias: result.target.alias,
        targetId: result.target.receiveId,
      },
      preview: result.preview,
    };
  }

  if (selection.platform === "qq") {
    const result = await sendQqMessage(profileId, {
      targetAlias: selection.targetAlias ?? undefined,
      message: {
        type: "text",
        text: input.message.text,
      },
    });

    return {
      delivered: result.delivered,
      messageId: result.messageId,
      target: {
        platform: "qq",
        targetAlias: result.target.alias,
        targetId: result.target.targetId,
      },
      preview: result.preview,
    };
  }

  if (selection.platform === "telegram") {
    return await sendTelegramMessage(profileId, {
      targetAlias: selection.targetAlias ?? undefined,
      targetId: selection.targetId ?? undefined,
      message: input.message,
    });
  }

  throw new Error("No channel delivery implementation matched the request.");
};

export { listChannelTargets, sendChannelMessage };
