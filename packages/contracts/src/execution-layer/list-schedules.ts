import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { scheduleStatusSchema, scheduleTypeSchema } from "./schedule";

const listSchedulesInputSchema = z.object({
  types: z.array(scheduleTypeSchema).min(1).max(3).optional(),
  statuses: z.array(scheduleStatusSchema).min(1).max(4).optional(),
  upcomingOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const listSchedulesOutputSchema = z.object({
  referenceNow: z.string().datetime(),
  count: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      id: z.string().trim().min(1),
      type: scheduleTypeSchema,
      status: scheduleStatusSchema,
      title: z.string().trim().min(1),
      content: z.string().trim().min(1),
      triggerAt: z.string().datetime().nullable(),
      cronExpr: z.string().trim().max(120).nullable(),
      timezone: z.string().trim().min(1).max(80),
      lastTriggeredAt: z.string().datetime().nullable(),
      deliveredAt: z.string().datetime().nullable(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    }),
  ),
});

const listSchedulesDef = toolDefinition({
  name: "list_schedules",
  description:
    "List the user's current schedules, reminders, alarms, or monitors. Use this when the user asks what reminders or scheduled items currently exist.",
  inputSchema: listSchedulesInputSchema,
  outputSchema: listSchedulesOutputSchema,
});

export {
  listSchedulesDef,
  listSchedulesInputSchema,
  listSchedulesOutputSchema,
};

export type ListSchedulesInput = z.infer<typeof listSchedulesInputSchema>;
export type ListSchedulesOutput = z.infer<typeof listSchedulesOutputSchema>;
