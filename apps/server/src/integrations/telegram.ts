import type { StoredMessagingTarget } from "@neobuni/db";
import {
	getStoredMessagingPlatformConfig as getStoredMessagingPlatformConfigFx,
	runRepo,
	upsertMessagingPlatformConfig as upsertMessagingPlatformConfigFx,
} from "@neobuni/db";

const getStoredMessagingPlatformConfig = (
	...args: Parameters<typeof getStoredMessagingPlatformConfigFx>
) => runRepo(getStoredMessagingPlatformConfigFx(...args));
const upsertMessagingPlatformConfig = (
	...args: Parameters<typeof upsertMessagingPlatformConfigFx>
) => runRepo(upsertMessagingPlatformConfigFx(...args));

import type {
	ChannelMessagePayload,
	TelegramMessagingConfig,
	TelegramMessagingConfigInput,
	TelegramMessagingTargetInput,
} from "@neobuni/contracts";

type TelegramTargetSummary = {
	platform: "telegram";
	targetAlias: string;
	targetId: string;
	label: string | null;
};

type TelegramResolvedTarget = {
	platform: "telegram";
	targetAlias: string | null;
	targetId: string;
	messageThreadId: number | null;
};

type SendTelegramMessageInput = {
	targetAlias?: string;
	targetId?: string;
	message: ChannelMessagePayload;
	replyToMessageId?: number;
	messageThreadId?: number | null;
};

type SendTelegramMessageResult = {
	delivered: boolean;
	messageId: string | null;
	target: Omit<TelegramResolvedTarget, "messageThreadId">;
	preview: string;
};

const DEFAULT_TELEGRAM_API_BASE_URL = "https://api.telegram.org";

const normalizeOptional = (value: string | undefined | null) =>
	value?.trim() ?? "";

const parseTargetsJson = (
	value: string | undefined
): TelegramMessagingTargetInput[] => {
	if (!value || value.trim().length === 0) {
		return [];
	}

	try {
		const parsed = JSON.parse(value) as Record<
			string,
			{
				label?: string;
				targetType?: string;
				targetId?: string;
				enabled?: boolean;
				metadata?: Record<string, unknown>;
			}
		>;

		return Object.entries(parsed)
			.flatMap(([alias, target]) => {
				if (
					typeof target?.targetType !== "string" ||
					typeof target?.targetId !== "string" ||
					target.targetId.trim().length === 0
				) {
					return [];
				}

				return [
					{
						alias,
						label: typeof target.label === "string" ? target.label.trim() : "",
						targetType:
							target.targetType as TelegramMessagingTargetInput["targetType"],
						targetId: target.targetId.trim(),
						enabled: target.enabled ?? true,
						metadata:
							target.metadata && typeof target.metadata === "object"
								? target.metadata
								: {},
					},
				];
			})
			.sort((left, right) => left.alias.localeCompare(right.alias));
	} catch {
		return [];
	}
};

const createTelegramConfig = (
	profileId: string,
	input?: Partial<TelegramMessagingConfig>
): TelegramMessagingConfig => {
	const now = new Date().toISOString();

	return {
		id: input?.id ?? "telegram-config-default",
		profileId,
		source: input?.source ?? "default",
		enabled: input?.enabled ?? false,
		botToken: input?.botToken ?? "",
		appId: input?.appId ?? "",
		publicKey: input?.publicKey ?? "",
		webhookSecret: input?.webhookSecret ?? "",
		metadata: input?.metadata ?? {},
		targets: input?.targets ?? [],
		createdAt: input?.createdAt ?? now,
		updatedAt: input?.updatedAt ?? now,
	};
};

const mapStoredTarget = (
	target: StoredMessagingTarget
): TelegramMessagingTargetInput => ({
	alias: target.alias,
	label: target.label,
	targetType: target.targetType as TelegramMessagingTargetInput["targetType"],
	targetId: target.targetId,
	enabled: target.enabled,
	metadata: target.metadata,
});

const readEnvTelegramConfig = (
	profileId: string
): TelegramMessagingConfig | null => {
	const botToken = normalizeOptional(process.env.NEOBUNI_TELEGRAM_BOT_TOKEN);
	const webhookSecret = normalizeOptional(
		process.env.NEOBUNI_TELEGRAM_WEBHOOK_SECRET
	);
	const botUsername = normalizeOptional(
		process.env.NEOBUNI_TELEGRAM_BOT_USERNAME
	);
	const targets = parseTargetsJson(process.env.NEOBUNI_TELEGRAM_TARGETS_JSON);

	if (
		botToken.length === 0 &&
		webhookSecret.length === 0 &&
		botUsername.length === 0 &&
		targets.length === 0
	) {
		return null;
	}

	return createTelegramConfig(profileId, {
		source: "env",
		enabled: botToken.length > 0,
		botToken,
		appId: "",
		publicKey: "",
		webhookSecret,
		metadata:
			botUsername.length > 0
				? {
						botUsername,
					}
				: {},
		targets,
	});
};

const toTelegramConfig = (
	profileId: string,
	stored: Awaited<ReturnType<typeof getStoredMessagingPlatformConfig>>
) => {
	if (!stored) {
		return null;
	}

	return createTelegramConfig(profileId, {
		id: stored.id,
		source: stored.source,
		enabled: stored.enabled,
		botToken: stored.botToken,
		appId: stored.appId,
		publicKey: stored.publicKey,
		webhookSecret: stored.webhookSecret,
		metadata: stored.metadata,
		targets: stored.targets.map(mapStoredTarget),
		createdAt: stored.createdAt,
		updatedAt: stored.updatedAt,
	});
};

const getEffectiveTelegramConfig = async (
	profileId: string
): Promise<TelegramMessagingConfig> => {
	const storedConfig = toTelegramConfig(
		profileId,
		await getStoredMessagingPlatformConfig(profileId, "telegram")
	);

	if (storedConfig) {
		return storedConfig;
	}

	return readEnvTelegramConfig(profileId) ?? createTelegramConfig(profileId);
};

const saveTelegramConfig = async (
	profileId: string,
	input: TelegramMessagingConfigInput
): Promise<TelegramMessagingConfig> => {
	const stored = await upsertMessagingPlatformConfig(
		profileId,
		"telegram",
		input
	);

	if (!stored) {
		throw new Error("Failed to save Telegram config.");
	}

	return createTelegramConfig(profileId, {
		id: stored.id,
		source: stored.source,
		enabled: stored.enabled,
		botToken: stored.botToken,
		appId: stored.appId,
		publicKey: stored.publicKey,
		webhookSecret: stored.webhookSecret,
		metadata: stored.metadata,
		targets: stored.targets.map(mapStoredTarget),
		createdAt: stored.createdAt,
		updatedAt: stored.updatedAt,
	});
};

const listTelegramTargets = async (
	profileId: string
): Promise<TelegramTargetSummary[]> => {
	const config = await getEffectiveTelegramConfig(profileId);

	return config.targets
		.filter((target) => target.enabled)
		.map((target) => ({
			platform: "telegram" as const,
			targetAlias: target.alias,
			targetId: target.targetId,
			label: target.label.trim().length > 0 ? target.label : null,
		}));
};

const assertTelegramConfigured = (config: TelegramMessagingConfig) => {
	if (!config.enabled || config.botToken.trim().length === 0) {
		throw new Error(
			"Telegram integration is not configured. Save the bot token in Settings > Messaging > Telegram or set NEOBUNI_TELEGRAM_BOT_TOKEN."
		);
	}
};

const readMessageThreadIdFromMetadata = (metadata: Record<string, unknown>) => {
	const value = metadata.messageThreadId;
	return typeof value === "number" && Number.isInteger(value)
		? value
		: typeof value === "string" && /^\d+$/.test(value)
			? Number(value)
			: null;
};

const resolveTelegramTarget = (
	config: TelegramMessagingConfig,
	input: SendTelegramMessageInput
): TelegramResolvedTarget => {
	const enabledTargets = config.targets.filter((target) => target.enabled);

	if (input.targetAlias) {
		const target = enabledTargets.find(
			(candidate) => candidate.alias === input.targetAlias
		);
		if (!target) {
			throw new Error(`Unknown Telegram target alias: ${input.targetAlias}.`);
		}

		return {
			platform: "telegram",
			targetAlias: target.alias,
			targetId: target.targetId,
			messageThreadId:
				input.messageThreadId ??
				readMessageThreadIdFromMetadata(target.metadata) ??
				null,
		};
	}

	if (input.targetId) {
		const target = enabledTargets.find(
			(candidate) => candidate.targetId === input.targetId
		);
		return {
			platform: "telegram",
			targetAlias: target?.alias ?? null,
			targetId: input.targetId,
			messageThreadId:
				input.messageThreadId ??
				(target ? readMessageThreadIdFromMetadata(target.metadata) : null),
		};
	}

	if (enabledTargets.length === 1) {
		const [target] = enabledTargets;
		if (!target) {
			throw new Error("Telegram target resolution failed.");
		}

		return {
			platform: "telegram",
			targetAlias: target.alias,
			targetId: target.targetId,
			messageThreadId:
				input.messageThreadId ??
				readMessageThreadIdFromMetadata(target.metadata) ??
				null,
		};
	}

	throw new Error(
		"send_channel_message requires a Telegram targetAlias or targetId. If exactly one Telegram target is enabled, omitting both will use it automatically."
	);
};

const readTelegramMessageId = async (response: Response) => {
	try {
		const json = (await response.json()) as {
			result?: {
				message_id?: number | string;
			};
		};
		return json.result?.message_id === undefined
			? null
			: String(json.result.message_id);
	} catch {
		return null;
	}
};

const previewText = (value: string) =>
	value.length > 240 ? `${value.slice(0, 240)}...` : value;

const sendTelegramMessage = async (
	profileId: string,
	input: SendTelegramMessageInput
): Promise<SendTelegramMessageResult> => {
	if (input.message.type !== "text") {
		throw new Error("Telegram Phase 1 only supports text messages.");
	}

	const config = await getEffectiveTelegramConfig(profileId);
	assertTelegramConfigured(config);
	const target = resolveTelegramTarget(config, input);
	const response = await fetch(
		`${DEFAULT_TELEGRAM_API_BASE_URL}/bot${config.botToken}/sendMessage`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				chat_id: target.targetId,
				text: input.message.text,
				...(target.messageThreadId === null
					? {}
					: {
							message_thread_id: target.messageThreadId,
						}),
				...(input.replyToMessageId === undefined
					? {}
					: {
							reply_parameters: {
								message_id: input.replyToMessageId,
							},
						}),
			}),
		}
	);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`Failed to send Telegram message (${response.status}): ${errorText}`
		);
	}

	return {
		delivered: true,
		messageId: await readTelegramMessageId(response),
		target: {
			platform: "telegram",
			targetAlias: target.targetAlias,
			targetId: target.targetId,
		},
		preview: previewText(input.message.text),
	};
};

export {
	getEffectiveTelegramConfig,
	listTelegramTargets,
	saveTelegramConfig,
	sendTelegramMessage,
};
