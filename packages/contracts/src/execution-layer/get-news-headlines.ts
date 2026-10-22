import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import {
  newsHeadlineSchema,
  newsProviderSchema,
  newsSourceIdSchema,
} from "./news-shared";

const getNewsHeadlinesInputSchema = z.object({
  sourceId: newsSourceIdSchema,
  count: z.number().int().min(1).max(20).optional(),
});

const getNewsHeadlinesOutputSchema = z.object({
  provider: newsProviderSchema,
  sourceId: newsSourceIdSchema,
  sourceName: z.string().trim().min(1).max(120),
  updatedTime: z.string().datetime().nullable(),
  count: z.number().int().nonnegative(),
  items: z.array(newsHeadlineSchema),
});

const getNewsHeadlinesDef = toolDefinition({
  name: "get_news_headlines",
  description:
    "Fetch the latest hot headlines from one concrete NewsNow source. Use this when the user already provides the canonical sourceId, such as 'sspai' or 'hackernews', or after resolve_news_source has resolved a named site to a canonical sourceId.",
  inputSchema: getNewsHeadlinesInputSchema,
  outputSchema: getNewsHeadlinesOutputSchema,
});

export {
  getNewsHeadlinesDef,
  getNewsHeadlinesInputSchema,
  getNewsHeadlinesOutputSchema,
};

export type GetNewsHeadlinesInput = z.infer<typeof getNewsHeadlinesInputSchema>;
export type GetNewsHeadlinesOutput = z.infer<typeof getNewsHeadlinesOutputSchema>;
