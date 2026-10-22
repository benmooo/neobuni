import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { memorySchema } from "../cognition-layer/memory";

const markTaskDoneInputSchema = z.object({
	memoryId: z.string().trim().min(1),
	resolutionNote: z.string().trim().min(1).max(1000).optional(),
});

const markTaskDoneDef = toolDefinition({
	name: "mark_task_done",
	description:
		"Mark a stored task memory as completed when the user says the commitment is finished or no longer open.",
	inputSchema: markTaskDoneInputSchema,
	outputSchema: z.object({
		completed: z.boolean(),
		task: memorySchema,
		note: z.string().optional(),
	}),
});

export { markTaskDoneDef, markTaskDoneInputSchema };
