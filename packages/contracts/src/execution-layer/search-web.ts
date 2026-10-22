import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { webProviderSchema, webSearchResultItemSchema } from "./web-shared";

const searchWebInputSchema = z.object({
	query: z.string().trim().min(1).max(300),
	domain: z.string().trim().min(1).max(200).optional(),
	limit: z.number().int().min(1).max(10).default(5),
});

const searchWebOutputSchema = z.object({
	provider: webProviderSchema,
	query: z.string().trim().min(1),
	count: z.number().int().nonnegative(),
	items: z.array(webSearchResultItemSchema),
});

const searchWebDef = toolDefinition({
	name: "search_web",
	description:
		"Search the public web for candidate pages about a topic. Use this when the user wants sources or URLs to inspect next. It returns result candidates only, not full page content.",
	inputSchema: searchWebInputSchema,
	outputSchema: searchWebOutputSchema,
});

export { searchWebDef, searchWebInputSchema, searchWebOutputSchema };

export type SearchWebInput = z.infer<typeof searchWebInputSchema>;
export type SearchWebOutput = z.infer<typeof searchWebOutputSchema>;
