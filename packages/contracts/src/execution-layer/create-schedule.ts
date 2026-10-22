import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { channelTargetSchema } from "./channel-target";
import {
  scheduleBlueprintSchema,
  scheduleStatusSchema,
  scheduleTypeSchema,
} from "./schedule";

const createScheduleInputSchema = z.object({
  type: scheduleTypeSchema.default("monitor"),
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(4000).optional(),
  taskPrompt: z.string().trim().min(1).max(12_000),
  triggerAt: z.string().datetime().nullable().optional(),
  cronExpr: z.string().trim().min(1).max(120).nullable().optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  toolAllowlist: z.array(z.string().trim().min(1)).max(128).nullable().optional(),
  maxSteps: z.number().int().min(1).max(128).nullable().optional(),
  timeoutMs: z.number().int().min(1).max(3_600_000).nullable().optional(),
  channelTarget: channelTargetSchema.nullable().optional(),
  deliverToConversation: z.boolean().optional(),
  input: z.record(z.string(), z.unknown()).nullable().optional(),
});

const createScheduleOutputSchema = z.object({
  scheduleId: z.string().trim().min(1),
  status: scheduleStatusSchema,
  type: scheduleTypeSchema,
  triggerAt: z.string().datetime().nullable(),
  cronExpr: z.string().trim().max(120).nullable(),
  timezone: z.string().trim().min(1).max(80),
  blueprint: scheduleBlueprintSchema.nullable(),
});

const createScheduleDef = toolDefinition({
  name: "create_schedule",
  description:
    "Create a generic scheduled agent task. Use this when the user wants Buni to run a future or recurring task automatically from a prompt and tool policy.",
  inputSchema: createScheduleInputSchema,
  outputSchema: createScheduleOutputSchema,
});

export {
  createScheduleDef,
  createScheduleInputSchema,
  createScheduleOutputSchema,
};

export type CreateScheduleInput = z.infer<typeof createScheduleInputSchema>;
export type CreateScheduleOutput = z.infer<typeof createScheduleOutputSchema>;
