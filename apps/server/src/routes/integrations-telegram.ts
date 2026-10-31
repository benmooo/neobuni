import {
  createConversation as createConversationFx,
  createExternalConversationBinding as createExternalConversationBindingFx,
  getExternalConversationBinding as getExternalConversationBindingFx,
  getMessagingIntegrationByWebhookSecret as getMessagingIntegrationByWebhookSecretFx,
  recordExternalEventReceipt as recordExternalEventReceiptFx,
  runRepo,
  touchExternalConversationBinding as touchExternalConversationBindingFx,
} from "@neobuni/db";

const createConversation = (...args: Parameters<typeof createConversationFx>) =>
  runRepo(createConversationFx(...args));
const createExternalConversationBinding = (
  ...args: Parameters<typeof createExternalConversationBindingFx>
) => runRepo(createExternalConversationBindingFx(...args));
const getExternalConversationBinding = (
  ...args: Parameters<typeof getExternalConversationBindingFx>
) => runRepo(getExternalConversationBindingFx(...args));
const getMessagingIntegrationByWebhookSecret = (
  ...args: Parameters<typeof getMessagingIntegrationByWebhookSecretFx>
) => runRepo(getMessagingIntegrationByWebhookSecretFx(...args));
const recordExternalEventReceipt = (
  ...args: Parameters<typeof recordExternalEventReceiptFx>
) => runRepo(recordExternalEventReceiptFx(...args));
const touchExternalConversationBinding = (
  ...args: Parameters<typeof touchExternalConversationBindingFx>
) => runRepo(touchExternalConversationBindingFx(...args));

import { Hono } from "hono";

import {
  answerTelegramCallbackQuery,
  editTelegramMessageText,
  sendTelegramMessage,
} from "../integrations/telegram";
import { runExternalMessageTurn } from "../runtime/run-external-message-turn";
import {
  applyStudyNudgeAction,
  bindStudyGoalChannel,
  parseNudgeCallback,
} from "../study/nudge-actions";
import {
  applyStudyScoutAction,
  parseScoutCallback,
} from "../study/scout-actions";

interface TelegramIntegrationRouteDeps {
  answerTelegramCallbackQuery?: typeof answerTelegramCallbackQuery;
  applyStudyNudgeAction?: typeof applyStudyNudgeAction;
  applyStudyScoutAction?: typeof applyStudyScoutAction;
  bindStudyGoalChannel?: typeof bindStudyGoalChannel;
  createConversation: typeof createConversation;
  createExternalConversationBinding: typeof createExternalConversationBinding;
  editTelegramMessageText?: typeof editTelegramMessageText;
  getExternalConversationBinding: typeof getExternalConversationBinding;
  getMessagingIntegrationByWebhookSecret: typeof getMessagingIntegrationByWebhookSecret;
  recordExternalEventReceipt: typeof recordExternalEventReceipt;
  runExternalMessageTurn: typeof runExternalMessageTurn;
  sendTelegramMessage: typeof sendTelegramMessage;
  touchExternalConversationBinding: typeof touchExternalConversationBinding;
}

interface TelegramUser {
  is_bot?: boolean;
  username?: string;
}

interface TelegramChat {
  id?: number;
  title?: string;
  type?: string;
}

interface TelegramMessage {
  chat?: TelegramChat;
  from?: TelegramUser;
  message_id?: number;
  message_thread_id?: number;
  reply_to_message?: {
    message_id?: number;
    from?: TelegramUser;
  };
  text?: string;
}

interface TelegramCallbackQuery {
  data?: string;
  id?: string;
  message?: TelegramMessage;
}

interface TelegramUpdate {
  callback_query?: TelegramCallbackQuery;
  message?: TelegramMessage;
  update_id?: number;
}

const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";

const defaultDeps: TelegramIntegrationRouteDeps = {
  answerTelegramCallbackQuery,
  applyStudyNudgeAction,
  applyStudyScoutAction,
  bindStudyGoalChannel,
  createConversation,
  createExternalConversationBinding,
  editTelegramMessageText,
  getExternalConversationBinding,
  getMessagingIntegrationByWebhookSecret,
  recordExternalEventReceipt,
  runExternalMessageTurn,
  sendTelegramMessage,
  touchExternalConversationBinding,
};

const STUDY_START_PREFIX = "bunistudy_";

const readStudyStartPayload = (text: string | undefined) => {
  const match = (text ?? "")
    .trim()
    .match(/^\/start(?:@[A-Za-z0-9_]+)?\s+(\S+)$/);
  const payload = match?.[1] ?? "";
  return payload.startsWith(STUDY_START_PREFIX)
    ? payload.slice(STUDY_START_PREFIX.length)
    : null;
};

const readTelegramUpdate = (rawBody: string) => {
  try {
    return JSON.parse(rawBody) as TelegramUpdate;
  } catch {
    return null;
  }
};

const normalizeTelegramUsername = (value: string | null | undefined) =>
  value?.trim().replace(/^@/, "").toLowerCase() ?? "";

const readConfiguredBotUsername = (metadata: Record<string, unknown>) =>
  typeof metadata.botUsername === "string"
    ? normalizeTelegramUsername(metadata.botUsername)
    : "";

const readTelegramScopeKey = (message: TelegramMessage) =>
  typeof message.chat?.id === "number" ? String(message.chat.id) : null;

const readTelegramCommandPrompt = (
  message: TelegramMessage,
  configuredBotUsername: string
) => {
  const text = message.text?.trim() ?? "";
  const match = text.match(/^\/buni(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?$/);

  if (!match) {
    return null;
  }

  const targetUsername = normalizeTelegramUsername(match[1]);
  if (
    configuredBotUsername.length > 0 &&
    targetUsername.length > 0 &&
    targetUsername !== configuredBotUsername
  ) {
    return null;
  }

  return match[2]?.trim() ?? "";
};

const isReplyToConfiguredBot = (
  message: TelegramMessage,
  configuredBotUsername: string
) => {
  const replyAuthor = message.reply_to_message?.from;
  if (!replyAuthor?.is_bot) {
    return false;
  }

  if (configuredBotUsername.length === 0) {
    return true;
  }

  return (
    normalizeTelegramUsername(replyAuthor.username) === configuredBotUsername
  );
};

const readTelegramPrompt = (
  message: TelegramMessage,
  configuredBotUsername: string
) => {
  const commandPrompt = readTelegramCommandPrompt(
    message,
    configuredBotUsername
  );
  if (commandPrompt !== null) {
    return commandPrompt;
  }

  const replyText = message.text?.trim() ?? "";
  return isReplyToConfiguredBot(message, configuredBotUsername) &&
    replyText.length > 0
    ? replyText
    : null;
};

const createTelegramIntegrationRoutes = (
  deps: TelegramIntegrationRouteDeps = defaultDeps
) => {
  const resolved: TelegramIntegrationRouteDeps = { ...defaultDeps, ...deps };

  return new Hono().post("/events", async (c) => {
    const rawBody = await c.req.raw.clone().text();
    const update = readTelegramUpdate(rawBody);

    if (!update) {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const secretToken = c.req.header(TELEGRAM_SECRET_HEADER)?.trim() ?? "";
    const integration =
      secretToken.length > 0
        ? await resolved.getMessagingIntegrationByWebhookSecret(
            "telegram",
            secretToken
          )
        : null;

    if (!integration) {
      return c.json({ error: "Telegram integration not configured" }, 404);
    }

    if (typeof update.update_id !== "number") {
      return c.json({ error: "Telegram update is missing update_id" }, 400);
    }

    const receipt = await resolved.recordExternalEventReceipt({
      profileId: integration.profileId,
      platform: "telegram",
      eventId: String(update.update_id),
    });

    if (!receipt.inserted) {
      return c.json({ ok: true, duplicate: true }, 200);
    }

    const message = update.message;
    const callback = update.callback_query;
    if (callback) {
      if (typeof callback.id !== "string") {
        return c.json({ ignored: true, ok: true }, 200);
      }
      const data = typeof callback.data === "string" ? callback.data : "";
      const parsed = parseNudgeCallback(data);
      const parsedScout = parsed ? null : parseScoutCallback(data);
      if (!(parsed || parsedScout)) {
        return c.json({ ignored: true, ok: true }, 200);
      }
      const result = parsed
        ? await resolved.applyStudyNudgeAction?.({
            action: parsed.action,
            profileId: integration.profileId,
            sessionId: parsed.sessionId,
          })
        : await resolved.applyStudyScoutAction?.({
            action: parsedScout?.action ?? "skip",
            digestId: parsedScout?.digestId ?? "",
            index: parsedScout?.index ?? 0,
            profileId: integration.profileId,
          });
      await resolved.answerTelegramCallbackQuery?.(integration.profileId, {
        callbackQueryId: callback.id,
        text: result?.ack ?? "这条提醒已经失效",
      });
      const callbackChatId = callback.message?.chat?.id;
      const callbackMessageId = callback.message?.message_id;
      if (
        result &&
        typeof callbackChatId === "number" &&
        typeof callbackMessageId === "number"
      ) {
        await resolved.editTelegramMessageText?.(integration.profileId, {
          messageId: String(callbackMessageId),
          targetId: String(callbackChatId),
          text: result.text,
        });
      }
      return c.json({ acted: result !== null, ok: true }, 200);
    }
    if (!message) {
      return c.json({ ok: true, ignored: true }, 200);
    }

    const scopeKey = readTelegramScopeKey(message);
    if (!scopeKey) {
      return c.json({ ok: true, ignored: true }, 200);
    }

    const studyGoalId = readStudyStartPayload(message.text);
    if (studyGoalId) {
      const bound = await resolved.bindStudyGoalChannel?.({
        chatId: scopeKey,
        goalId: studyGoalId,
        profileId: integration.profileId,
      });
      await resolved.sendTelegramMessage(integration.profileId, {
        message: {
          text: bound?.bound
            ? "已绑定。学习时段前会在这里提醒你，按钮可以直接开始或改期。"
            : "没有找到这个学习目标，请先在 Buni 里生成计划。",
          type: "text",
        },
        targetId: scopeKey,
      });
      return c.json({ ok: true, bound: bound?.bound ?? false }, 200);
    }

    const latestUserText = readTelegramPrompt(
      message,
      readConfiguredBotUsername(integration.metadata)
    );
    if (latestUserText === null) {
      return c.json({ ok: true, ignored: true }, 200);
    }

    if (latestUserText.length === 0) {
      await resolved.sendTelegramMessage(integration.profileId, {
        targetId: scopeKey,
        message: {
          type: "text",
          text: "Please provide a prompt for /buni.",
        },
        ...(typeof message.message_id === "number"
          ? {
              replyToMessageId: message.message_id,
            }
          : {}),
        ...(typeof message.message_thread_id === "number"
          ? {
              messageThreadId: message.message_thread_id,
            }
          : {}),
      });

      return c.json({ ok: true }, 200);
    }

    const existingBinding = await resolved.getExternalConversationBinding({
      profileId: integration.profileId,
      platform: "telegram",
      scopeType: "telegram_chat",
      scopeKey,
    });
    const conversationId =
      existingBinding?.conversationId ??
      (
        await resolved.createConversation(integration.profileId, {
          title: `[telegram] ${scopeKey}`,
          modelKey: "default",
          hidden: true,
        })
      ).id;

    if (!existingBinding) {
      await resolved.createExternalConversationBinding({
        profileId: integration.profileId,
        platform: "telegram",
        scopeType: "telegram_chat",
        scopeKey,
        conversationId,
      });
    }

    await resolved.touchExternalConversationBinding({
      profileId: integration.profileId,
      platform: "telegram",
      scopeType: "telegram_chat",
      scopeKey,
      lastInboundAt: new Date().toISOString(),
    });

    const runtimeResult = await resolved.runExternalMessageTurn({
      profileId: integration.profileId,
      conversationId,
      latestUserText,
      platform: "telegram",
      externalThreadId: String(update.update_id),
      clientTimezone: null,
    });

    await resolved.sendTelegramMessage(integration.profileId, {
      targetId: scopeKey,
      message: {
        type: "text",
        text:
          runtimeResult.assistantText.length > 0
            ? runtimeResult.assistantText
            : "I could not produce a reply.",
      },
      ...(typeof message.message_id === "number"
        ? {
            replyToMessageId: message.message_id,
          }
        : {}),
      ...(typeof message.message_thread_id === "number"
        ? {
            messageThreadId: message.message_thread_id,
          }
        : {}),
    });

    return c.json({ ok: true }, 200);
  });
};

const telegramIntegrationRoutes = createTelegramIntegrationRoutes();

export { createTelegramIntegrationRoutes, telegramIntegrationRoutes };
