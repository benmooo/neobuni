import { z } from "zod";

import { idSchema, isoDateTimeSchema } from "../common/base";

const messagingConfigSourceSchema = z.enum([
  "database",
  "env",
  "default",
]);

const messagingPlatformSchema = z.enum([
  "discord",
  "telegram",
  "feishu",
  "qq",
]);

const messagingTargetTypeSchema = z.enum([
  "channel",
  "group",
  "supergroup",
  "topic",
]);

const discordMessagingTargetInputSchema = z.object({
  alias: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
      "Alias must start with a letter or number and only contain letters, numbers, underscores, or hyphens.",
    ),
  label: z.string().trim().max(120).default(""),
  targetType: messagingTargetTypeSchema,
  targetId: z.string().trim().min(1).max(200),
  enabled: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const discordMessagingConfigInputSchema = z
  .object({
    enabled: z.boolean().default(false),
    botToken: z.string().trim().max(400).default(""),
    appId: z.string().trim().max(200).default(""),
    publicKey: z.string().trim().max(300).default(""),
    webhookSecret: z.string().trim().max(300).default(""),
    metadata: z.record(z.string(), z.unknown()).default({}),
    targets: z.array(discordMessagingTargetInputSchema).max(100).default([]),
  })
  .superRefine((value, ctx) => {
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

const discordMessagingConfigSchema = discordMessagingConfigInputSchema.extend({
  id: idSchema,
  profileId: idSchema,
  source: messagingConfigSourceSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export {
  discordMessagingConfigInputSchema,
  discordMessagingConfigSchema,
  discordMessagingTargetInputSchema,
  messagingConfigSourceSchema,
  messagingPlatformSchema,
  messagingTargetTypeSchema,
};

export type DiscordMessagingConfig = z.infer<
  typeof discordMessagingConfigSchema
>;
export type DiscordMessagingConfigInput = z.infer<
  typeof discordMessagingConfigInputSchema
>;
export type DiscordMessagingTargetInput = z.infer<
  typeof discordMessagingTargetInputSchema
>;
export type MessagingConfigSource = z.infer<
  typeof messagingConfigSourceSchema
>;
export type MessagingPlatform = z.infer<typeof messagingPlatformSchema>;
export type MessagingTargetType = z.infer<typeof messagingTargetTypeSchema>;
