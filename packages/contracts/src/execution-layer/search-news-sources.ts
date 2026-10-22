import { toolDefinition } from "@tanstack/ai"
import { z } from "zod"

import { newsSourceCategorySchema, newsSourceSchema } from "./news-shared"

const searchNewsSourcesInputSchema = z
  .object({
    query: z.string().trim().min(1).max(120).optional(),
    category: newsSourceCategorySchema.optional(),
    enabledOnly: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .refine(
    (input) => input.query !== undefined || input.category !== undefined,
    {
      message: "search_news_sources requires query or category.",
    },
  )

const searchNewsSourcesOutputSchema = z.object({
  count: z.number().int().nonnegative(),
  items: z.array(newsSourceSchema),
})

const searchNewsSourcesDef = toolDefinition({
  name: "search_news_sources",
  description:
    "Search or filter curated NewsNow sources by query text and/or category when the user wants a narrowed browse list, such as finance feeds or domestic news sources. Use list_news_sources for the full browse list. Use resolve_news_source when the user names one specific site and you need its canonical sourceId.",
  inputSchema: searchNewsSourcesInputSchema,
  outputSchema: searchNewsSourcesOutputSchema,
})

export {
  searchNewsSourcesDef,
  searchNewsSourcesInputSchema,
  searchNewsSourcesOutputSchema,
}

export type SearchNewsSourcesInput = z.infer<
  typeof searchNewsSourcesInputSchema
>
export type SearchNewsSourcesOutput = z.infer<
  typeof searchNewsSourcesOutputSchema
>
