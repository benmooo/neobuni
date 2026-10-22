import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { channelPlatformSchema, channelTargetSchema } from "./channel-target";

const listChannelTargetsInputSchema = z.object({
	platform: channelPlatformSchema.optional(),
});

const listChannelTargetsOutputSchema = z.object({
	count: z.number().int().nonnegative(),
	items: z.array(
		channelTargetSchema.extend({
			label: z.string().trim().min(1).nullable(),
		})
	),
});

const listChannelTargetsDef = toolDefinition({
	name: "list_channel_targets",
	description:
		"List configured generic channel delivery targets across Discord, Telegram, Feishu, and QQ.",
	inputSchema: listChannelTargetsInputSchema,
	outputSchema: listChannelTargetsOutputSchema,
});

export {
	listChannelTargetsDef,
	listChannelTargetsInputSchema,
	listChannelTargetsOutputSchema,
};

export type ListChannelTargetsInput = z.infer<
	typeof listChannelTargetsInputSchema
>;
export type ListChannelTargetsOutput = z.infer<
	typeof listChannelTargetsOutputSchema
>;
