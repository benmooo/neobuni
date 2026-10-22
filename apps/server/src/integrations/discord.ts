import { createPublicKey, verify } from "node:crypto";
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
	DiscordMessagingConfig,
	DiscordMessagingConfigInput,
	DiscordMessagingTargetInput,
} from "@neobuni/contracts";

type DiscordTargetSummary = {
	platform: "discord";
	targetAlias: string;
	targetId: string;
	label: string | null;
};

type DiscordResolvedTarget = {
	platform: "discord";
	targetAlias: string | null;
	targetId: string;
};

type SendDiscordMessageInput = {
	targetAlias?: string;
	targetId?: string;
	message: ChannelMessagePayload;
};

type SendDiscordMessageResult = {
	delivered: boolean;
	messageId: string | null;
	target: DiscordResolvedTarget;
	preview: string;
};

const DEFAULT_DISCORD_API_BASE_URL = "https://discord.com/api/v10";

const normalizeOptional = (value: string | undefined | null) =>
	value?.trim() ?? "";

const parseTargetsJson = (
	value: string | undefined
): DiscordMessagingTargetInput[] => {
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
							target.targetType as DiscordMessagingTargetInput["targetType"],
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

const createDiscordConfig = (
	profileId: string,
	input?: Partial<DiscordMessagingConfig>
): DiscordMessagingConfig => {
	const now = new Date().toISOString();

	return {
		id: input?.id ?? "discord-config-default",
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
): DiscordMessagingTargetInput => ({
	alias: target.alias,
	label: target.label,
	targetType: target.targetType as DiscordMessagingTargetInput["targetType"],
	targetId: target.targetId,
	enabled: target.enabled,
	metadata: target.metadata,
});

const readEnvDiscordConfig = (
	profileId: string
): DiscordMessagingConfig | null => {
	const botToken = normalizeOptional(process.env.NEOBUNI_DISCORD_BOT_TOKEN);
	const appId = normalizeOptional(process.env.NEOBUNI_DISCORD_APP_ID);
	const publicKey = normalizeOptional(process.env.NEOBUNI_DISCORD_PUBLIC_KEY);
	const webhookSecret = normalizeOptional(
		process.env.NEOBUNI_DISCORD_WEBHOOK_SECRET
	);
	const targets = parseTargetsJson(process.env.NEOBUNI_DISCORD_TARGETS_JSON);

	if (
		!(botToken || appId || publicKey || webhookSecret) &&
		targets.length === 0
	) {
		return null;
	}

	return createDiscordConfig(profileId, {
		source: "env",
		enabled: botToken.length > 0,
		botToken,
		appId,
		publicKey,
		webhookSecret,
		metadata: {},
		targets,
	});
};

const toDiscordConfig = (
	profileId: string,
	stored: Awaited<ReturnType<typeof getStoredMessagingPlatformConfig>>
) => {
	if (!stored) {
		return null;
	}

	return createDiscordConfig(profileId, {
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

const getEffectiveDiscordConfig = async (
	profileId: string
): Promise<DiscordMessagingConfig> => {
	const storedConfig = toDiscordConfig(
		profileId,
		await getStoredMessagingPlatformConfig(profileId, "discord")
	);

	if (storedConfig) {
		return storedConfig;
	}

	return readEnvDiscordConfig(profileId) ?? createDiscordConfig(profileId);
};

const saveDiscordConfig = async (
	profileId: string,
	input: DiscordMessagingConfigInput
): Promise<DiscordMessagingConfig> => {
	const stored = await upsertMessagingPlatformConfig(
		profileId,
		"discord",
		input
	);

	if (!stored) {
		throw new Error("Failed to save Discord config.");
	}

	return createDiscordConfig(profileId, {
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

const listDiscordTargets = async (
	profileId: string
): Promise<DiscordTargetSummary[]> => {
	const config = await getEffectiveDiscordConfig(profileId);

	return config.targets
		.filter((target) => target.enabled)
		.map((target) => ({
			platform: "discord" as const,
			targetAlias: target.alias,
			targetId: target.targetId,
			label: target.label.trim().length > 0 ? target.label : null,
		}));
};

const assertDiscordConfigured = (config: DiscordMessagingConfig) => {
	if (!config.enabled || config.botToken.trim().length === 0) {
		throw new Error(
			"Discord integration is not configured. Save the bot token in Settings > Messaging > Discord or set NEOBUNI_DISCORD_BOT_TOKEN."
		);
	}
};

const resolveDiscordTarget = (
	config: DiscordMessagingConfig,
	input: SendDiscordMessageInput
): DiscordResolvedTarget => {
	const enabledTargets = config.targets.filter((target) => target.enabled);

	if (input.targetAlias) {
		const target = enabledTargets.find(
			(candidate) => candidate.alias === input.targetAlias
		);
		if (!target) {
			throw new Error(`Unknown Discord target alias: ${input.targetAlias}.`);
		}

		return {
			platform: "discord",
			targetAlias: target.alias,
			targetId: target.targetId,
		};
	}

	if (input.targetId) {
		const target = enabledTargets.find(
			(candidate) => candidate.targetId === input.targetId
		);
		return {
			platform: "discord",
			targetAlias: target?.alias ?? null,
			targetId: input.targetId,
		};
	}

	if (enabledTargets.length === 1) {
		const [target] = enabledTargets;
		if (!target) {
			throw new Error("Discord target resolution failed.");
		}

		return {
			platform: "discord",
			targetAlias: target.alias,
			targetId: target.targetId,
		};
	}

	throw new Error(
		"send_channel_message requires a Discord targetAlias or targetId. If exactly one Discord target is enabled, omitting both will use it automatically."
	);
};

const readDiscordMessageId = async (response: Response) => {
	try {
		const json = (await response.json()) as {
			id?: string;
		};
		return json.id ?? null;
	} catch {
		return null;
	}
};

const previewText = (value: string) =>
	value.length > 240 ? `${value.slice(0, 240)}...` : value;

const sendDiscordMessage = async (
	profileId: string,
	input: SendDiscordMessageInput
): Promise<SendDiscordMessageResult> => {
	if (input.message.type !== "text") {
		throw new Error("Discord Phase 1 only supports text messages.");
	}

	const config = await getEffectiveDiscordConfig(profileId);
	assertDiscordConfigured(config);
	const target = resolveDiscordTarget(config, input);
	const response = await fetch(
		`${DEFAULT_DISCORD_API_BASE_URL}/channels/${target.targetId}/messages`,
		{
			method: "POST",
			headers: {
				Authorization: `Bot ${config.botToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				content: input.message.text,
			}),
		}
	);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`Failed to send Discord message (${response.status}): ${errorText}`
		);
	}

	return {
		delivered: true,
		messageId: await readDiscordMessageId(response),
		target,
		preview: previewText(input.message.text),
	};
};

const hexToBuffer = (value: string) => Buffer.from(value, "hex");

const verifyDiscordInteractionSignature = (input: {
	rawBody: string;
	signature: string;
	timestamp: string;
	publicKey: string;
}) => {
	const publicKey = createPublicKey({
		key: hexToBuffer(input.publicKey),
		format: "der",
		type: "spki",
	});

	return verify(
		null,
		Buffer.from(`${input.timestamp}${input.rawBody}`, "utf8"),
		publicKey,
		hexToBuffer(input.signature)
	);
};

export type {
	DiscordResolvedTarget,
	DiscordTargetSummary,
	SendDiscordMessageInput,
	SendDiscordMessageResult,
};
export {
	getEffectiveDiscordConfig,
	listDiscordTargets,
	saveDiscordConfig,
	sendDiscordMessage,
	verifyDiscordInteractionSignature,
};
