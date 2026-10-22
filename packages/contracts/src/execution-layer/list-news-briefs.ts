import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { newsBriefSchema } from "./news-shared";

const listNewsBriefsInputSchema = z.object({});

const listNewsBriefsOutputSchema = z.object({
  count: z.number().int().nonnegative(),
  items: z.array(newsBriefSchema),
});

const listNewsBriefsDef = toolDefinition({
  name: "list_news_briefs",
  description:
    "List Buni's curated multi-source news briefs. Use this when the user asks for a default AI, tech, or China brief instead of naming a single source.",
  inputSchema: listNewsBriefsInputSchema,
  outputSchema: listNewsBriefsOutputSchema,
});

export {
  listNewsBriefsDef,
  listNewsBriefsInputSchema,
  listNewsBriefsOutputSchema,
};

export type ListNewsBriefsInput = z.infer<typeof listNewsBriefsInputSchema>;
export type ListNewsBriefsOutput = z.infer<typeof listNewsBriefsOutputSchema>;
