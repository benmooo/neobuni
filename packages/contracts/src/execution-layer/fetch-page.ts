import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { webPageDocumentSchema, webProviderSchema } from "./web-shared";

const fetchPageInputSchema = z.object({
  url: z.url(),
});

const fetchPageOutputSchema = z.object({
  provider: webProviderSchema,
  document: webPageDocumentSchema,
});

const fetchPageDef = toolDefinition({
  name: "fetch_page",
  description:
    "Fetch and normalize one web page into clean content plus metadata. Use this before saving a page to knowledge or before asking for detailed content analysis.",
  inputSchema: fetchPageInputSchema,
  outputSchema: fetchPageOutputSchema,
});

export { fetchPageDef, fetchPageInputSchema, fetchPageOutputSchema };

export type FetchPageInput = z.infer<typeof fetchPageInputSchema>;
export type FetchPageOutput = z.infer<typeof fetchPageOutputSchema>;
