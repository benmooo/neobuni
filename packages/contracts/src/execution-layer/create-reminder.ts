import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { scheduleBlueprintSchema } from "./schedule";

const createReminderInputSchema = z.object({
	title: z.string().trim().min(1),
	content: z.string().trim().min(1),
	triggerAt: z.string().datetime(),
	timezone: z.string().trim().min(1).max(80).optional(),
});

const createReminderDef = toolDefinition({
	name: "create_reminder",
	description:
		"Create a reminder in the user's schedule. Provide the final absolute triggerAt yourself. If you need an authoritative current time before reasoning about relative dates or times, call now first.",
	inputSchema: createReminderInputSchema,
	outputSchema: z.object({
		scheduleId: z.string(),
		created: z.boolean(),
		triggerAt: z.string().datetime(),
		timezone: z.string(),
		localDisplay: z.string(),
		blueprint: scheduleBlueprintSchema.nullable().optional(),
		note: z.string().optional(),
	}),
});

export { createReminderDef, createReminderInputSchema };
