import { z } from "zod";

const discordExternalConversationRolloverReasonSchema = z.enum([
	"message_count",
	"estimated_tokens",
	"idle",
]);

const discordExternalConversationRolloverLimitsSchema = z.object({
	maxWindowMessageCount: z.number().int().min(1),
	maxWindowEstimatedTokens: z.number().int().min(1),
	maxWindowIdleMs: z.number().int().min(1),
	seedMessageCount: z.number().int().min(0),
});

const discordExternalConversationWindowStatsSchema = z.object({
	messageCount: z.number().int().nonnegative(),
	totalContentChars: z.number().int().nonnegative(),
	estimatedTokens: z.number().int().nonnegative(),
	lastMessageAt: z.string().datetime().nullable(),
});

const discordExternalConversationSeedMessageSchema = z.object({
	id: z.string().trim().min(1),
	role: z.enum(["system", "user", "assistant", "tool"]),
	kind: z.enum(["text", "generated", "event", "tool_result"]),
	content: z.string(),
	metadata: z.record(z.string(), z.unknown()),
	createdAt: z.string().datetime(),
});

type DiscordExternalConversationRolloverReason = z.infer<
	typeof discordExternalConversationRolloverReasonSchema
>;
type DiscordExternalConversationRolloverLimits = z.infer<
	typeof discordExternalConversationRolloverLimitsSchema
>;
type DiscordExternalConversationWindowStats = z.infer<
	typeof discordExternalConversationWindowStatsSchema
>;
type DiscordExternalConversationSeedMessage = z.infer<
	typeof discordExternalConversationSeedMessageSchema
>;

const DISCORD_EXTERNAL_CONVERSATION_ROLLOVER_LIMITS: DiscordExternalConversationRolloverLimits =
	{
		maxWindowMessageCount: 120,
		maxWindowEstimatedTokens: 24_000,
		maxWindowIdleMs: 72 * 60 * 60 * 1000,
		seedMessageCount: 12,
	};

const estimateDiscordExternalConversationTokens = (totalContentChars: number) =>
	Math.ceil(totalContentChars / 4);

const decideDiscordExternalConversationRollover = (input: {
	stats: DiscordExternalConversationWindowStats;
	now: string;
	limits?: DiscordExternalConversationRolloverLimits;
}) => {
	const limits = input.limits ?? DISCORD_EXTERNAL_CONVERSATION_ROLLOVER_LIMITS;

	if (input.stats.messageCount >= limits.maxWindowMessageCount) {
		return {
			shouldRollover: true,
			reason: "message_count" as const,
		};
	}

	if (input.stats.estimatedTokens >= limits.maxWindowEstimatedTokens) {
		return {
			shouldRollover: true,
			reason: "estimated_tokens" as const,
		};
	}

	if (
		input.stats.lastMessageAt !== null &&
		Date.parse(input.now) - Date.parse(input.stats.lastMessageAt) >=
			limits.maxWindowIdleMs
	) {
		return {
			shouldRollover: true,
			reason: "idle" as const,
		};
	}

	return {
		shouldRollover: false,
		reason: null,
	};
};

const selectDiscordExternalConversationSeedMessages = (input: {
	messages: DiscordExternalConversationSeedMessage[];
	seedMessageCount: number;
}) =>
	input.messages
		.filter((message) => message.role !== "system")
		.slice(-input.seedMessageCount);

export type {
	DiscordExternalConversationRolloverLimits,
	DiscordExternalConversationRolloverReason,
	DiscordExternalConversationSeedMessage,
	DiscordExternalConversationWindowStats,
};
export {
	DISCORD_EXTERNAL_CONVERSATION_ROLLOVER_LIMITS,
	decideDiscordExternalConversationRollover,
	discordExternalConversationRolloverLimitsSchema,
	discordExternalConversationRolloverReasonSchema,
	discordExternalConversationSeedMessageSchema,
	discordExternalConversationWindowStatsSchema,
	estimateDiscordExternalConversationTokens,
	selectDiscordExternalConversationSeedMessages,
};
