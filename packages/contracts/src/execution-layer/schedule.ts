import { z } from "zod";

import { channelTargetSchema } from "./channel-target";

const scheduleTypeSchema = z.enum(["reminder", "alarm", "monitor"]);
const scheduleStatusSchema = z.enum(["active", "paused", "completed", "cancelled"]);
const scheduleDeliveryIntentSchema = z.object({
  conversationId: z.string().trim().min(1).nullable().default(null),
  channelTarget: channelTargetSchema.nullable().default(null),
});
const scheduleBlueprintSchema = z.object({
  version: z.literal(1),
  prompt: z.string().trim().min(1).max(12_000),
  toolAllowlist: z.array(z.string().trim().min(1)).max(128).nullable().default(null),
  maxSteps: z.number().int().min(1).max(128).nullable().default(null),
  timeoutMs: z.number().int().min(1).max(3_600_000).nullable().default(null),
  deliveryIntent: scheduleDeliveryIntentSchema.nullable().default(null),
  input: z.record(z.string(), z.unknown()).nullable().default(null),
});

const scheduleCreateSchema = z.object({
  type: scheduleTypeSchema,
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(4000),
  triggerAt: z.string().datetime().nullable().default(null),
  cronExpr: z.string().trim().max(120).nullable().default(null),
  timezone: z.string().trim().min(1).max(80).default("UTC"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  blueprint: scheduleBlueprintSchema.nullable().optional(),
});

const scheduleUpdateSchema = z.object({
  type: scheduleTypeSchema.optional(),
  title: z.string().trim().min(1).max(120).optional(),
  content: z.string().trim().min(1).max(4000).optional(),
  triggerAt: z.string().datetime().nullable().optional(),
  cronExpr: z.string().trim().max(120).nullable().optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  blueprint: scheduleBlueprintSchema.nullable().optional(),
  status: scheduleStatusSchema.optional(),
});

const scheduleSchema = scheduleCreateSchema.extend({
  id: z.string(),
  profileId: z.string(),
  status: scheduleStatusSchema,
  lastTriggeredAt: z.string().datetime().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  lastMaterializedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export {
  scheduleBlueprintSchema,
  scheduleCreateSchema,
  scheduleDeliveryIntentSchema,
  scheduleSchema,
  scheduleStatusSchema,
  scheduleTypeSchema,
  scheduleUpdateSchema,
};

export type ScheduleCreateInput = z.infer<typeof scheduleCreateSchema>;
export type ScheduleUpdateInput = z.infer<typeof scheduleUpdateSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
