import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { webPageDocumentSchema, webSummaryLengthSchema } from "./web-shared";

const summarizePageInputSchema = z.object({
	url: z.url(),
	goal: z.string().trim().min(1).max(1000).optional(),
	length: webSummaryLengthSchema.default("medium"),
});

const summarizePageOutputSchema = z.object({
	document: webPageDocumentSchema.pick({
		url: true,
		finalUrl: true,
		title: true,
		siteName: true,
		publishedAt: true,
	}),
	summary: z.string().trim().min(1),
	notes: z.array(z.string().trim().min(1)),
});

const summarizePageDef = toolDefinition({
	name: "summarize_page",
	description:
		"Open one page and return a concise grounded summary. Use this when the user wants the key points of a URL before deciding whether to inspect or save it.",
	inputSchema: summarizePageInputSchema,
	outputSchema: summarizePageOutputSchema,
});

export {
	summarizePageDef,
	summarizePageInputSchema,
	summarizePageOutputSchema,
};

export type SummarizePageInput = z.infer<typeof summarizePageInputSchema>;
export type SummarizePageOutput = z.infer<typeof summarizePageOutputSchema>;
