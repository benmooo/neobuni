import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import {
  webPageDocumentSchema,
  webProviderSchema,
  webRenderModeSchema,
} from "./web-shared";

const extractPageInputSchema = z.object({
  url: z.url(),
  instruction: z.string().trim().min(1).max(2_000),
  schema: z.record(z.string(), z.unknown()).optional(),
  renderMode: webRenderModeSchema.default("auto"),
});

const extractPageOutputSchema = z.object({
  provider: webProviderSchema,
  document: webPageDocumentSchema,
  data: z.unknown(),
  generatedSchema: z.record(z.string(), z.unknown()).nullable(),
});

const extractPageDef = toolDefinition({
  name: "extract_page",
  description:
    "Extract structured JSON from a single web page. Use this when the user wants fields, entities, pricing tables, timelines, or other structured information from a URL.",
  inputSchema: extractPageInputSchema,
  outputSchema: extractPageOutputSchema,
});

export {
  extractPageDef,
  extractPageInputSchema,
  extractPageOutputSchema,
};

export type ExtractPageInput = z.infer<typeof extractPageInputSchema>;
export type ExtractPageOutput = z.infer<typeof extractPageOutputSchema>;
