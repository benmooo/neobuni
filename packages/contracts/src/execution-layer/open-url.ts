import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import {
  webPageDocumentSchema,
  webProviderSchema,
  webRenderModeSchema,
} from "./web-shared";

const openUrlInputSchema = z.object({
  url: z.url(),
  renderMode: webRenderModeSchema.default("auto"),
});

const openUrlOutputSchema = z.object({
  provider: webProviderSchema,
  document: webPageDocumentSchema,
});

const openUrlDef = toolDefinition({
  name: "open_url",
  description:
    "Fetch and normalize one web page into clean content plus metadata. Use this before saving a page to knowledge or before asking for detailed content analysis.",
  inputSchema: openUrlInputSchema,
  outputSchema: openUrlOutputSchema,
});

export {
  openUrlDef,
  openUrlInputSchema,
  openUrlOutputSchema,
};

export type OpenUrlInput = z.infer<typeof openUrlInputSchema>;
export type OpenUrlOutput = z.infer<typeof openUrlOutputSchema>;
