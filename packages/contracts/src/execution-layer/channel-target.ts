import { z } from "zod";

const channelPlatformSchema = z.enum(["discord", "telegram", "feishu", "qq"]);

const channelTargetSchema = z
	.object({
		platform: channelPlatformSchema,
		targetAlias: z.string().trim().min(1).nullable().default(null),
		targetId: z.string().trim().min(1).nullable().default(null),
	})
	.superRefine((value, ctx) => {
		if (value.targetAlias !== null || value.targetId !== null) {
			return;
		}

		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["targetAlias"],
			message: "Either targetAlias or targetId is required.",
		});
	});

export { channelPlatformSchema, channelTargetSchema };

export type ChannelPlatform = z.infer<typeof channelPlatformSchema>;
export type ChannelTarget = z.infer<typeof channelTargetSchema>;
