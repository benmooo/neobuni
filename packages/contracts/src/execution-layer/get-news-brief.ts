import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import {
  newsBriefIdSchema,
  newsHeadlineSchema,
  newsProviderSchema,
  newsSourceFetchResultSchema,
} from "./news-shared";

const getNewsBriefInputSchema = z.object({
  briefId: newsBriefIdSchema,
  countPerSource: z.number().int().min(1).max(10).optional(),
  maxItems: z.number().int().min(1).max(30).optional(),
});

const getNewsBriefOutputSchema = z.object({
  provider: newsProviderSchema,
  briefId: newsBriefIdSchema,
  briefLabel: z.string().trim().min(1).max(120),
  updatedTime: z.string().datetime().nullable(),
  count: z.number().int().nonnegative(),
  sourceCount: z.number().int().positive(),
  items: z.array(newsHeadlineSchema),
  sources: z.array(newsSourceFetchResultSchema),
  notes: z.array(z.string().trim().min(1).max(500)),
});

const getNewsBriefDef = toolDefinition({
  name: "get_news_brief",
  description:
    "Fetch a curated multi-source news brief from NewsNow, such as the AI mix, broad tech mix, or China/community mix. Use this when the user asks for a default news bundle instead of one concrete source.",
  inputSchema: getNewsBriefInputSchema,
  outputSchema: getNewsBriefOutputSchema,
});

export { getNewsBriefDef, getNewsBriefInputSchema, getNewsBriefOutputSchema };

export type GetNewsBriefInput = z.infer<typeof getNewsBriefInputSchema>;
export type GetNewsBriefOutput = z.infer<typeof getNewsBriefOutputSchema>;
