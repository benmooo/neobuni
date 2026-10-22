import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { qqTargetTypeSchema } from "./send-qq-message";

const listQqTargetsInputSchema = z.object({});

const listQqTargetsOutputSchema = z.object({
	count: z.number().int().nonnegative(),
	items: z.array(
		z.object({
			alias: z.string().trim().min(1),
			label: z.string().trim().min(1).nullable(),
			targetType: qqTargetTypeSchema,
			targetIdPreview: z.string().trim().min(1),
		})
	),
});

const listQqTargetsDef = toolDefinition({
	name: "list_qq_targets",
	description:
		"List configured QQ target aliases that Buni can send messages to through the current QQ bot integration.",
	inputSchema: listQqTargetsInputSchema,
	outputSchema: listQqTargetsOutputSchema,
});

export {
	listQqTargetsDef,
	listQqTargetsInputSchema,
	listQqTargetsOutputSchema,
};

export type ListQqTargetsOutput = z.infer<typeof listQqTargetsOutputSchema>;
