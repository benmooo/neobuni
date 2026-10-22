import { z } from "zod";

const webProviderSchema = z.literal("webclaw");

const webRenderModeSchema = z.enum(["auto", "reader", "rendered"]);

const webSummaryLengthSchema = z.enum(["short", "medium", "long"]);

const webSearchResultItemSchema = z.object({
	rank: z.number().int().positive(),
	title: z.string().trim().min(1),
	url: z.url(),
	snippet: z.string().trim().min(1).nullable(),
	sourceName: z.string().trim().min(1).nullable(),
	publishedAt: z.string().datetime().nullable(),
});

const webPageDocumentSchema = z.object({
	url: z.url(),
	finalUrl: z.url(),
	title: z.string().trim().min(1).nullable(),
	siteName: z.string().trim().min(1).nullable(),
	byline: z.string().trim().min(1).nullable(),
	publishedAt: z.string().datetime().nullable(),
	language: z.string().trim().min(1).nullable(),
	excerpt: z.string().trim().min(1).nullable(),
	markdown: z.string(),
	plainText: z.string(),
	statusCode: z.number().int().positive().nullable(),
	extractionMethod: z.enum(["reader", "rendered", "provider"]),
	warnings: z.array(z.string()),
	fetchedAt: z.string().datetime(),
});

export {
	webPageDocumentSchema,
	webProviderSchema,
	webRenderModeSchema,
	webSearchResultItemSchema,
	webSummaryLengthSchema,
};

export type WebPageDocument = z.infer<typeof webPageDocumentSchema>;
export type WebSearchResultItem = z.infer<typeof webSearchResultItemSchema>;
