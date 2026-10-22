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

import { sendTelegramMessage } from "../integrations/telegram";
import { runExternalMessageTurn } from "../runtime/run-external-message-turn";

type TelegramIntegrationRouteDeps = {
	createConversation: typeof createConversation;
	createExternalConversationBinding: typeof createExternalConversationBinding;
	getExternalConversationBinding: typeof getExternalConversationBinding;
	getMessagingIntegrationByWebhookSecret: typeof getMessagingIntegrationByWebhookSecret;
	recordExternalEventReceipt: typeof recordExternalEventReceipt;
	runExternalMessageTurn: typeof runExternalMessageTurn;
	sendTelegramMessage: typeof sendTelegramMessage;
	touchExternalConversationBinding: typeof touchExternalConversationBinding;
};

type TelegramUser = {
	is_bot?: boolean;
	username?: string;
};

type TelegramChat = {
	id?: number;
	type?: string;
	title?: string;
};

type TelegramMessage = {
	message_id?: number;
	message_thread_id?: number;
	text?: string;
	chat?: TelegramChat;
	from?: TelegramUser;
	reply_to_message?: {
		message_id?: number;
		from?: TelegramUser;
	};
};

type TelegramUpdate = {
	update_id?: number;
	message?: TelegramMessage;
};

const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";

const defaultDeps: TelegramIntegrationRouteDeps = {
	createConversation,
	createExternalConversationBinding,
	getExternalConversationBinding,
	getMessagingIntegrationByWebhookSecret,
	recordExternalEventReceipt,
	runExternalMessageTurn,
	sendTelegramMessage,
	touchExternalConversationBinding,
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
) =>
	new Hono().post("/events", async (c) => {
		const rawBody = await c.req.raw.clone().text();
		const update = readTelegramUpdate(rawBody);

		if (!update) {
			return c.json({ error: "Invalid JSON body" }, 400);
		}

		const secretToken = c.req.header(TELEGRAM_SECRET_HEADER)?.trim() ?? "";
		const integration =
			secretToken.length > 0
				? await deps.getMessagingIntegrationByWebhookSecret(
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

		const receipt = await deps.recordExternalEventReceipt({
			profileId: integration.profileId,
			platform: "telegram",
			eventId: String(update.update_id),
		});

		if (!receipt.inserted) {
			return c.json({ ok: true, duplicate: true }, 200);
		}

		const message = update.message;
		if (!message) {
			return c.json({ ok: true, ignored: true }, 200);
		}

		const scopeKey = readTelegramScopeKey(message);
		if (!scopeKey) {
			return c.json({ ok: true, ignored: true }, 200);
		}

		const latestUserText = readTelegramPrompt(
			message,
			readConfiguredBotUsername(integration.metadata)
		);

		if (latestUserText === null) {
			return c.json({ ok: true, ignored: true }, 200);
		}

		if (latestUserText.length === 0) {
			await deps.sendTelegramMessage(integration.profileId, {
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

		const existingBinding = await deps.getExternalConversationBinding({
			profileId: integration.profileId,
			platform: "telegram",
			scopeType: "telegram_chat",
			scopeKey,
		});
		const conversationId =
			existingBinding?.conversationId ??
			(
				await deps.createConversation(integration.profileId, {
					title: `[telegram] ${scopeKey}`,
					modelKey: "default",
					hidden: true,
				})
			).id;

		if (!existingBinding) {
			await deps.createExternalConversationBinding({
				profileId: integration.profileId,
				platform: "telegram",
				scopeType: "telegram_chat",
				scopeKey,
				conversationId,
			});
		}

		await deps.touchExternalConversationBinding({
			profileId: integration.profileId,
			platform: "telegram",
			scopeType: "telegram_chat",
			scopeKey,
			lastInboundAt: new Date().toISOString(),
		});

		const runtimeResult = await deps.runExternalMessageTurn({
			profileId: integration.profileId,
			conversationId,
			latestUserText,
			platform: "telegram",
			externalThreadId: String(update.update_id),
			clientTimezone: null,
		});

		await deps.sendTelegramMessage(integration.profileId, {
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

const telegramIntegrationRoutes = createTelegramIntegrationRoutes();

export { createTelegramIntegrationRoutes, telegramIntegrationRoutes };
