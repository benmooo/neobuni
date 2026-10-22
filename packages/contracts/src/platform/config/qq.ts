import { z } from "zod";

import { qqTargetTypeSchema } from "../../execution-layer/send-qq-message";
import { idSchema, isoDateTimeSchema } from "../common/base";

const qqConfigSourceSchema = z.enum(["database", "env", "default"]);

const qqTargetConfigInputSchema = z.object({
	alias: z
		.string()
		.trim()
		.min(1)
		.max(80)
		.regex(
			/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
			"Alias must start with a letter or number and only contain letters, numbers, underscores, or hyphens."
		),
	label: z.string().trim().max(120).default(""),
	targetType: qqTargetTypeSchema,
	targetId: z.string().trim().min(1).max(200),
	enabled: z.boolean().default(true),
});

const qqConfigInputSchema = z
	.object({
		enabled: z.boolean().default(false),
		appId: z.string().trim().max(200).default(""),
		appSecret: z.string().trim().max(400).default(""),
		baseUrl: z.string().trim().max(500).default(""),
		targets: z.array(qqTargetConfigInputSchema).max(100).default([]),
	})
	.superRefine((value, ctx) => {
		if (value.baseUrl.length > 0) {
			const parsed = z.url().safeParse(value.baseUrl);

			if (!parsed.success) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["baseUrl"],
					message: "Base URL must be a valid URL.",
				});
			}
		}

		const seenAliases = new Set<string>();

		value.targets.forEach((target, index) => {
			if (!seenAliases.has(target.alias)) {
				seenAliases.add(target.alias);
				return;
			}

			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["targets", index, "alias"],
				message: "Target aliases must be unique.",
			});
		});
	});

const qqConfigSchema = qqConfigInputSchema.extend({
	id: idSchema,
	profileId: idSchema,
	source: qqConfigSourceSchema,
	createdAt: isoDateTimeSchema,
	updatedAt: isoDateTimeSchema,
});

export {
	qqConfigInputSchema,
	qqConfigSchema,
	qqConfigSourceSchema,
	qqTargetConfigInputSchema,
};

export type QqConfig = z.infer<typeof qqConfigSchema>;
export type QqConfigInput = z.infer<typeof qqConfigInputSchema>;
export type QqConfigSource = z.infer<typeof qqConfigSourceSchema>;
export type QqTargetConfigInput = z.infer<typeof qqTargetConfigInputSchema>;
