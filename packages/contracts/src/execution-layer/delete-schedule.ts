import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const deleteScheduleInputSchema = z.object({
  scheduleId: z.string().trim().min(1),
});

const deleteScheduleOutputSchema = z.object({
  scheduleId: z.string().trim().min(1),
  deleted: z.boolean(),
});

const deleteScheduleDef = toolDefinition({
  name: "delete_schedule",
  description:
    "Delete a scheduled task blueprint. Use this when the user asks to remove a schedule entirely.",
  inputSchema: deleteScheduleInputSchema,
  outputSchema: deleteScheduleOutputSchema,
});

export {
  deleteScheduleDef,
  deleteScheduleInputSchema,
  deleteScheduleOutputSchema,
};
