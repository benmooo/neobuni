import { recallMemoryDef, recallMemoryInputSchema } from "@neobuni/contracts";
import { extractMemoryKeywords } from "@neobuni/core";
import { recallMemories } from "../memory/temporal-memory-store";
import type { ServerToolContext } from "./types";

const createRecallMemoryTool = (context: ServerToolContext) =>
	recallMemoryDef.server(async (args) => {
		const parsed = recallMemoryInputSchema.parse(args);
		const keywords =
			parsed.keywords && parsed.keywords.length > 0
				? parsed.keywords
				: extractMemoryKeywords(parsed.query).slice(0, 6);

		if (!context.embeddingConfig) {
			return {
				recalled: false,
				query: parsed.query,
				keywords,
				memories: [],
				error: "Memory embedding provider not configured.",
			};
		}

		const memories = await recallMemories({
			profileId: context.profileId,
			query: parsed.query,
			queryKeywords: keywords,
			embeddingConfig: context.embeddingConfig,
			limit: parsed.limit,
		});

		return {
			recalled: memories.length > 0,
			query: parsed.query,
			keywords,
			memories,
		};
	});

export { createRecallMemoryTool };
