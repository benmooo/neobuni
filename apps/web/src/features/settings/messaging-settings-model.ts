import type {
	MessagingConfigSource,
	MessagingTargetType,
} from "@neobuni/contracts";
import { z } from "zod";

const messagingTargetFormSchema = z.object({
	alias: z
		.string()
		.trim()
		.min(1)
		.max(80)
		.regex(
			/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
			"Alias must start with a letter or number and only contain letters, numbers, underscores, or hyphens."
		),
	label: z.string().trim().max(120),
	targetType: z.enum(["channel", "group", "supergroup", "topic"]),
	targetId: z.string().trim().min(1).max(200),
	enabled: z.boolean(),
	metadata: z.record(z.string(), z.unknown()),
});

const messagingTargetDraftSchema = messagingTargetFormSchema.extend({
	clientId: z.string().min(1),
});

type MessagingTargetFormValue = z.infer<typeof messagingTargetFormSchema>;
type MessagingTargetDraft = z.infer<typeof messagingTargetDraftSchema>;

const cloneMetadata = (metadata?: Record<string, unknown>) => ({
	...(metadata ?? {}),
});

const createMessagingTargetDraft = (
	input?: Partial<MessagingTargetFormValue>
): MessagingTargetDraft => ({
	clientId: crypto.randomUUID(),
	alias: input?.alias ?? "",
	label: input?.label ?? "",
	targetType: input?.targetType ?? "channel",
	targetId: input?.targetId ?? "",
	enabled: input?.enabled ?? true,
	metadata: cloneMetadata(input?.metadata),
});

const toMessagingTargetDrafts = (targets: MessagingTargetFormValue[]) =>
	targets.map((target) => createMessagingTargetDraft(target));

const stripMessagingTargetClientId = ({
	clientId: _clientId,
	...target
}: MessagingTargetDraft): MessagingTargetFormValue => ({
	...target,
	metadata: cloneMetadata(target.metadata),
});

const updateItemAtIndex = <T>(
	items: T[],
	index: number,
	updater: (item: T) => T
) =>
	items.map((item, currentIndex) =>
		currentIndex === index ? updater(item) : item
	);

const removeItemAtIndex = <T>(items: T[], index: number) =>
	items.filter((_, currentIndex) => currentIndex !== index);

const getMessagingConfigSourceLabel = (source: MessagingConfigSource) => {
	if (source === "database") {
		return "数据库";
	}
	if (source === "env") {
		return "环境变量回退";
	}
	return "未配置";
};

const readMessageThreadIdInput = (metadata: Record<string, unknown>) => {
	const value = metadata.messageThreadId;

	if (typeof value === "number" && Number.isInteger(value)) {
		return `${value}`;
	}

	if (typeof value === "string" && /^\d+$/.test(value)) {
		return value;
	}

	return "";
};

const omitMessageThreadId = (metadata: Record<string, unknown>) => {
	const { messageThreadId: _messageThreadId, ...rest } = metadata;
	return rest;
};

const writeMessageThreadIdMetadata = (
	metadata: Record<string, unknown>,
	messageThreadIdInput: string
) => {
	const trimmed = messageThreadIdInput.trim();

	if (!/^\d+$/.test(trimmed)) {
		return omitMessageThreadId(metadata);
	}

	return {
		...omitMessageThreadId(metadata),
		messageThreadId: Number(trimmed),
	};
};

export type {
	MessagingTargetDraft,
	MessagingTargetFormValue,
	MessagingTargetType,
};
export {
	createMessagingTargetDraft,
	getMessagingConfigSourceLabel,
	messagingTargetDraftSchema,
	messagingTargetFormSchema,
	readMessageThreadIdInput,
	removeItemAtIndex,
	stripMessagingTargetClientId,
	toMessagingTargetDrafts,
	updateItemAtIndex,
	writeMessageThreadIdMetadata,
};
