import {
  getMessagingIntegrationByPlatformAppId as getMessagingIntegrationByPlatformAppIdFx,
  recordExternalEventReceipt as recordExternalEventReceiptFx,
  resolveDiscordExternalConversationWindow as resolveDiscordExternalConversationWindowFx,
  runRepo,
} from "@neobuni/db";

const getMessagingIntegrationByPlatformAppId = (
  ...args: Parameters<typeof getMessagingIntegrationByPlatformAppIdFx>
) => runRepo(getMessagingIntegrationByPlatformAppIdFx(...args));
const recordExternalEventReceipt = (
  ...args: Parameters<typeof recordExternalEventReceiptFx>
) => runRepo(recordExternalEventReceiptFx(...args));
const resolveDiscordExternalConversationWindow = (
  ...args: Parameters<typeof resolveDiscordExternalConversationWindowFx>
) => runRepo(resolveDiscordExternalConversationWindowFx(...args));

import { Hono } from "hono";
import { verifyDiscordInteractionSignature } from "../integrations/discord";
import { executeDiscordInboundPrompt } from "../integrations/discord-inbound";
import { runExternalMessageTurn } from "../runtime/run-external-message-turn";

interface DiscordIntegrationRouteDeps {
  getMessagingIntegrationByPlatformAppId: typeof getMessagingIntegrationByPlatformAppId;
  recordExternalEventReceipt: typeof recordExternalEventReceipt;
  resolveDiscordExternalConversationWindow: typeof resolveDiscordExternalConversationWindow;
  runExternalMessageTurn: typeof runExternalMessageTurn;
}

interface DiscordInteraction {
  application_id?: string;
  channel_id?: string;
  data?: {
    name?: string;
    options?: Array<{
      name?: string;
      type?: number;
      value?: string;
    }>;
  };
  guild_id?: string;
  id?: string;
  type?: number;
}

const DISCORD_SIGNATURE_HEADER = "x-signature-ed25519";
const DISCORD_TIMESTAMP_HEADER = "x-signature-timestamp";

const defaultDeps: DiscordIntegrationRouteDeps = {
  getMessagingIntegrationByPlatformAppId,
  recordExternalEventReceipt,
  resolveDiscordExternalConversationWindow,
  runExternalMessageTurn,
};

const readDiscordInteraction = (rawBody: string) => {
  try {
    return JSON.parse(rawBody) as DiscordInteraction;
  } catch {
    return null;
  }
};

const buildDiscordScopeKey = (interaction: DiscordInteraction) => {
  if (!interaction.channel_id || interaction.channel_id.trim().length === 0) {
    return null;
  }

  return `${interaction.guild_id?.trim() || "dm"}:${interaction.channel_id.trim()}`;
};

const readDiscordSlashCommandText = (interaction: DiscordInteraction) =>
  interaction.data?.options
    ?.find(
      (option) =>
        typeof option.value === "string" && option.value.trim().length > 0
    )
    ?.value?.trim() ?? "";

const createDiscordIntegrationRoutes = (
  deps: DiscordIntegrationRouteDeps = defaultDeps
) =>
  new Hono().post("/events", async (c) => {
    const rawBody = await c.req.raw.clone().text();
    const interaction = readDiscordInteraction(rawBody);

    if (!interaction) {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (
      !interaction.application_id ||
      interaction.application_id.trim().length === 0
    ) {
      return c.json(
        { error: "Discord interaction is missing application_id" },
        400
      );
    }

    const integration = await deps.getMessagingIntegrationByPlatformAppId(
      "discord",
      interaction.application_id
    );

    if (!integration || integration.publicKey.trim().length === 0) {
      return c.json({ error: "Discord integration not configured" }, 404);
    }

    const timestamp = c.req.header(DISCORD_TIMESTAMP_HEADER);
    const signature = c.req.header(DISCORD_SIGNATURE_HEADER);

    if (!(timestamp && signature)) {
      return c.json({ error: "Missing Discord signature headers" }, 401);
    }

    if (
      !verifyDiscordInteractionSignature({
        rawBody,
        signature,
        timestamp,
        publicKey: integration.publicKey,
      })
    ) {
      return c.json({ error: "Invalid Discord signature" }, 401);
    }

    if (interaction.type === 1) {
      return c.json({ type: 1 }, 200);
    }

    if (!interaction.id || interaction.id.trim().length === 0) {
      return c.json({ error: "Discord interaction is missing id" }, 400);
    }

    const receipt = await deps.recordExternalEventReceipt({
      profileId: integration.profileId,
      platform: "discord",
      eventId: interaction.id,
    });

    if (!receipt.inserted) {
      return c.json(
        {
          type: 4,
          data: {
            content: "Duplicate interaction ignored.",
          },
        },
        200
      );
    }

    if (interaction.type === 2 && interaction.data?.name === "buni") {
      const scopeKey = buildDiscordScopeKey(interaction);
      if (!scopeKey) {
        return c.json(
          { error: "Discord interaction is missing channel_id" },
          400
        );
      }

      const latestUserText = readDiscordSlashCommandText(interaction);
      if (latestUserText.length === 0) {
        return c.json(
          {
            type: 4,
            data: {
              content: "Please provide a prompt for /buni.",
            },
          },
          200
        );
      }

      const runtimeResult = await executeDiscordInboundPrompt(
        {
          profileId: integration.profileId,
          scopeKey,
          latestUserText,
          externalThreadId: interaction.id,
        },
        {
          resolveDiscordExternalConversationWindow:
            deps.resolveDiscordExternalConversationWindow,
          runExternalMessageTurn: deps.runExternalMessageTurn,
        }
      );

      return c.json(
        {
          type: 4,
          data: {
            content:
              runtimeResult.assistantText.length > 0
                ? runtimeResult.assistantText
                : "I could not produce a reply.",
          },
        },
        200
      );
    }

    return c.json(
      {
        type: 4,
        data: {
          content: "Unsupported Discord interaction.",
        },
      },
      200
    );
  });

const discordIntegrationRoutes = createDiscordIntegrationRoutes();

export { createDiscordIntegrationRoutes, discordIntegrationRoutes };
