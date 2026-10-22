import { z } from "zod";

const discordGatewayMessageAuthorSchema = z.object({
	id: z.string().optional(),
	bot: z.boolean().optional(),
});

const discordGatewayMessageMentionSchema = z.object({
	id: z.string().optional(),
	bot: z.boolean().optional(),
});

const discordGatewayReferencedMessageSchema = z.object({
	author: discordGatewayMessageAuthorSchema.optional(),
});

const discordGatewayMessageCreateEventSchema = z.object({
	id: z.string().optional(),
	guild_id: z.string().optional(),
	channel_id: z.string().optional(),
	content: z.string().optional(),
	author: discordGatewayMessageAuthorSchema.optional(),
	mentions: z.array(discordGatewayMessageMentionSchema).optional(),
	referenced_message: discordGatewayReferencedMessageSchema.nullish(),
});

const discordGatewayInboundPromptSchema = z.object({
	eventId: z.string().trim().min(1),
	scopeKey: z.string().trim().min(1),
	targetId: z.string().trim().min(1),
	latestUserText: z.string().trim().min(1),
});

type DiscordGatewayMessageCreateEvent = z.infer<
	typeof discordGatewayMessageCreateEventSchema
>;
type DiscordGatewayInboundPrompt = z.infer<
	typeof discordGatewayInboundPromptSchema
>;

const buildDiscordScopeKey = (input: { guildId: string; channelId: string }) =>
	`${input.guildId}:${input.channelId}`;

const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeDiscordGatewayMessage = (input: {
	applicationId: string;
	event: DiscordGatewayMessageCreateEvent;
}): DiscordGatewayInboundPrompt | null => {
	const eventId = input.event.id?.trim() ?? "";
	const guildId = input.event.guild_id?.trim() ?? "";
	const channelId = input.event.channel_id?.trim() ?? "";
	const content = input.event.content?.trim() ?? "";

	if (
		eventId.length === 0 ||
		guildId.length === 0 ||
		channelId.length === 0 ||
		content.length === 0 ||
		input.event.author?.bot
	) {
		return null;
	}

	const mentionPattern = new RegExp(
		`<@!?${escapeRegExp(input.applicationId)}>`,
		"g"
	);
	const mentioned =
		(input.event.mentions ?? []).some(
			(mention) => mention.id === input.applicationId
		) || mentionPattern.test(content);
	const repliedToBot =
		input.event.referenced_message?.author?.id === input.applicationId &&
		input.event.referenced_message.author.bot === true;

	if (!(mentioned || repliedToBot)) {
		return null;
	}

	const latestUserText = mentioned
		? content.replace(mentionPattern, " ").replace(/\s+/g, " ").trim()
		: content;

	if (latestUserText.length === 0) {
		return null;
	}

	return {
		eventId,
		scopeKey: buildDiscordScopeKey({
			guildId,
			channelId,
		}),
		targetId: channelId,
		latestUserText,
	};
};

export type { DiscordGatewayInboundPrompt, DiscordGatewayMessageCreateEvent };
export {
	discordGatewayInboundPromptSchema,
	discordGatewayMessageCreateEventSchema,
	normalizeDiscordGatewayMessage,
};
