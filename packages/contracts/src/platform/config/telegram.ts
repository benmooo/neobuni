import type { z } from "zod";

import {
	discordMessagingConfigInputSchema,
	discordMessagingConfigSchema,
	discordMessagingTargetInputSchema,
} from "./discord";

const telegramMessagingTargetInputSchema = discordMessagingTargetInputSchema;
const telegramMessagingConfigInputSchema = discordMessagingConfigInputSchema;
const telegramMessagingConfigSchema = discordMessagingConfigSchema;

export {
	telegramMessagingConfigInputSchema,
	telegramMessagingConfigSchema,
	telegramMessagingTargetInputSchema,
};

export type TelegramMessagingConfig = z.infer<
	typeof telegramMessagingConfigSchema
>;
export type TelegramMessagingConfigInput = z.infer<
	typeof telegramMessagingConfigInputSchema
>;
export type TelegramMessagingTargetInput = z.infer<
	typeof telegramMessagingTargetInputSchema
>;
