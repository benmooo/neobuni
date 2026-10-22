import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const nowInputSchema = z.object({});

const nowOutputSchema = z.object({
	referenceNow: z.string().datetime(),
	timezone: z.string().trim().min(1).max(80),
	localDisplay: z.string().trim().min(1),
});

const nowDef = toolDefinition({
	name: "now",
	description:
		"Return the server-side current time for this turn plus the effective timezone. Use this before reasoning about relative dates or times yourself.",
	inputSchema: nowInputSchema,
	outputSchema: nowOutputSchema,
});

export { nowDef, nowInputSchema, nowOutputSchema };

export type NowOutput = z.infer<typeof nowOutputSchema>;
