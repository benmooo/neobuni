import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { newsSourceSchema } from "./news-shared";

const listNewsSourcesInputSchema = z
	.object({})
	.passthrough()
	.transform(() => ({}));

const listNewsSourcesOutputSchema = z.object({
	count: z.number().int().nonnegative(),
	items: z.array(newsSourceSchema),
});

const listNewsSourcesDef = toolDefinition({
	name: "list_news_sources",
	description:
		"List every curated NewsNow source that Buni can query. Use this when the user asks what news feeds are available or wants the full browse list. Do not pass filters here; use search_news_sources when the user asks for a narrowed subset, and use resolve_news_source when the user names one concrete site but not its canonical sourceId.",
	inputSchema: listNewsSourcesInputSchema,
	outputSchema: listNewsSourcesOutputSchema,
});

export {
	listNewsSourcesDef,
	listNewsSourcesInputSchema,
	listNewsSourcesOutputSchema,
};

export type ListNewsSourcesInput = z.infer<typeof listNewsSourcesInputSchema>;
export type ListNewsSourcesOutput = z.infer<typeof listNewsSourcesOutputSchema>;
