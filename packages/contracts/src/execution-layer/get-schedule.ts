import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { scheduleSchema } from "./schedule";

const getScheduleInputSchema = z.object({
  scheduleId: z.string().trim().min(1),
});

const getScheduleDef = toolDefinition({
  name: "get_schedule",
  description:
    "Get one schedule by id. Use this when the user asks for the details of a specific scheduled task.",
  inputSchema: getScheduleInputSchema,
  outputSchema: scheduleSchema,
});

export {
  getScheduleDef,
  getScheduleInputSchema,
};
