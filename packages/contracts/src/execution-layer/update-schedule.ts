import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { channelTargetSchema } from "./channel-target";
import {
  scheduleBlueprintSchema,
  scheduleSchema,
  scheduleStatusSchema,
  scheduleTypeSchema,
} from "./schedule";

const updateScheduleInputSchema = z.object({
  scheduleId: z.string().trim().min(1),
  type: scheduleTypeSchema.optional(),
  title: z.string().trim().min(1).max(120).optional(),
  content: z.string().trim().min(1).max(4000).optional(),
  taskPrompt: z.string().trim().min(1).max(12_000).optional(),
  triggerAt: z.string().datetime().nullable().optional(),
  cronExpr: z.string().trim().min(1).max(120).nullable().optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  status: scheduleStatusSchema.optional(),
  toolAllowlist: z.array(z.string().trim().min(1)).max(128).nullable().optional(),
  maxSteps: z.number().int().min(1).max(128).nullable().optional(),
  timeoutMs: z.number().int().min(1).max(3_600_000).nullable().optional(),
  channelTarget: channelTargetSchema.nullable().optional(),
  deliverToConversation: z.boolean().optional(),
  input: z.record(z.string(), z.unknown()).nullable().optional(),
  blueprint: scheduleBlueprintSchema.nullable().optional(),
});

const updateScheduleDef = toolDefinition({
  name: "update_schedule",
  description:
    "Update an existing scheduled agent task. Use this to change timing, task prompt, status, or tool policy.",
  inputSchema: updateScheduleInputSchema,
  outputSchema: scheduleSchema,
});

export {
  updateScheduleDef,
  updateScheduleInputSchema,
};

export type UpdateScheduleToolInput = z.infer<typeof updateScheduleInputSchema>;
