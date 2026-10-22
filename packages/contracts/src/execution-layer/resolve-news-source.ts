import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import {
  newsSourceIdSchema,
  newsSourceSchema,
} from "./news-shared";

const newsSourceMatchKindSchema = z.enum([
  "source_id",
  "name",
  "label",
  "alias",
  "description",
]);

const newsSourceResolutionStatusSchema = z.enum([
  "resolved",
  "ambiguous",
  "not_found",
]);

const resolvedNewsSourceCandidateSchema = z.object({
  source: newsSourceSchema,
  matchKind: newsSourceMatchKindSchema,
  matchedText: z.string().trim().min(1).max(200),
  exact: z.boolean(),
});

const resolveNewsSourceInputSchema = z.object({
  query: z.string().trim().min(1).max(120),
  limit: z.number().int().min(1).max(10).optional(),
});

const resolveNewsSourceOutputSchema = z.object({
  query: z.string().trim().min(1).max(120),
  status: newsSourceResolutionStatusSchema,
  resolvedSourceId: newsSourceIdSchema.nullable(),
  resolution: resolvedNewsSourceCandidateSchema.nullable(),
  count: z.number().int().nonnegative(),
  items: z.array(resolvedNewsSourceCandidateSchema),
});

const resolveNewsSourceDef = toolDefinition({
  name: "resolve_news_source",
  description:
    "Resolve a user-provided news site name, label, or alias to one canonical curated sourceId. Use this before get_news_headlines when the user names a site naturally, such as '少数派', 'Hacker News', or 'GitHub Trending'. If the user already provides the canonical sourceId such as 'sspai', call get_news_headlines directly.",
  inputSchema: resolveNewsSourceInputSchema,
  outputSchema: resolveNewsSourceOutputSchema,
});

export {
  newsSourceMatchKindSchema,
  newsSourceResolutionStatusSchema,
  resolvedNewsSourceCandidateSchema,
  resolveNewsSourceDef,
  resolveNewsSourceInputSchema,
  resolveNewsSourceOutputSchema,
};

export type NewsSourceMatchKind = z.infer<typeof newsSourceMatchKindSchema>;
export type NewsSourceResolutionStatus = z.infer<typeof newsSourceResolutionStatusSchema>;
export type ResolvedNewsSourceCandidate = z.infer<
  typeof resolvedNewsSourceCandidateSchema
>;
export type ResolveNewsSourceInput = z.infer<typeof resolveNewsSourceInputSchema>;
export type ResolveNewsSourceOutput = z.infer<typeof resolveNewsSourceOutputSchema>;
