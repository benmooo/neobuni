import type { TurnContext } from "@neobuni/contracts";
import { planTurnRetrieval, type RetrievedEvidence } from "@neobuni/core";
import { runRepo } from "@neobuni/db";
import { evaluateRetrievalDecision } from "../decision/retrieval-shadow-service";
import { recallGraphMemory } from "../memory/graph-memory-store";
import { recallKnowledge } from "../memory/knowledge-store";
import { recallMemories } from "../memory/temporal-memory-store";
import { serializeError } from "./runtime-observer";

const runRetrieval = async (input: {
	profileId: string;
	turnContext: TurnContext;
	allowMemoryRecall?: boolean;
	embeddingConfig: {
		apiKey: string;
		model: string;
		baseUrl?: string | undefined;
	} | null;
	observer: {
		recordPreRecall: (
			strategy: "pre_recall" | "tool_fallback" | "skip"
		) => void;
		startSpan: (
			stage:
				| "retrieval_signals"
				| "retrieval_plan"
				| "temporal_recall"
				| "graph_recall"
				| "knowledge_recall",
			payload?: Record<string, unknown> | null
		) => Promise<{ id: string }>;
		completeSpan: (
			spanId: string,
			output?: Record<string, unknown> | null
		) => Promise<unknown>;
		failSpan: (spanId: string, error?: unknown) => Promise<unknown>;
		skipStage: (
			stage: "temporal_recall" | "graph_recall" | "knowledge_recall",
			payload?: Record<string, unknown> | null,
			output?: Record<string, unknown> | null
		) => Promise<unknown>;
	};
}) => {
	const allowMemoryRecall = input.allowMemoryRecall ?? true;
	const { retrievalSignals, retrievalPlan: heuristicRetrievalPlan } =
		planTurnRetrieval(input.turnContext);
	const { retrievalPlan, appliedQuestionIds } = await runRepo(
		evaluateRetrievalDecision({
			profileId: input.profileId,
			latestUserText: input.turnContext.input.latestUserText,
			retrievalPlan: heuristicRetrievalPlan,
			trigger: "chat_retrieval",
		})
	).catch(() => ({
		retrievalPlan: heuristicRetrievalPlan,
		appliedQuestionIds: [],
	}));
	const temporalMode = retrievalPlan.activation.temporal.mode;
	const temporalStrategy = allowMemoryRecall
		? temporalMode === "prefetch"
			? "pre_recall"
			: temporalMode === "defer_to_tool"
				? "tool_fallback"
				: "skip"
		: "skip";

	input.observer.recordPreRecall(temporalStrategy);

	const retrievalSignalsSpan = await input.observer.startSpan(
		"retrieval_signals",
		{
			contentLength: input.turnContext.input.latestUserText.length,
			recentUserTextCount: input.turnContext.recentUserTexts.length,
		}
	);
	await input.observer.completeSpan(retrievalSignalsSpan.id, {
		signals: retrievalSignals,
		temporalActivation: retrievalPlan.activation.temporal,
		heuristicTemporalActivation: heuristicRetrievalPlan.activation.temporal,
		jevAppliedQuestionIds: appliedQuestionIds,
		temporalQuery: retrievalPlan.queries.temporal,
		toolFallbackAvailable: Boolean(input.embeddingConfig),
		allowMemoryRecall,
	});

	const retrievalPlanSpan = await input.observer.startSpan("retrieval_plan", {
		temporalMode,
		storeCount: retrievalPlan.stores.length,
	});
	await input.observer.completeSpan(retrievalPlanSpan.id, retrievalPlan);

	const temporalPromise = (async () => {
		if (!allowMemoryRecall) {
			await input.observer.skipStage(
				"temporal_recall",
				{
					strategy: temporalStrategy,
					query: retrievalPlan.queries.temporal,
				},
				{
					reason: "surface_policy_disabled",
					memoryCount: 0,
				}
			);
			return [];
		}

		if (
			input.embeddingConfig &&
			retrievalPlan.queries.temporal &&
			input.turnContext.input.latestUserText
		) {
			const temporalRecallSpan = await input.observer.startSpan(
				"temporal_recall",
				{
					strategy: temporalStrategy,
					query: retrievalPlan.queries.temporal,
				}
			);
			try {
				const temporalMemories = await recallMemories({
					profileId: input.profileId,
					query: retrievalPlan.queries.temporal.query,
					queryKeywords: retrievalPlan.queries.temporal.keywords,
					embeddingConfig: input.embeddingConfig,
					limit: retrievalPlan.queries.temporal.limit,
				});
				await input.observer.completeSpan(temporalRecallSpan.id, {
					query: retrievalPlan.queries.temporal,
					memoryCount: temporalMemories.length,
					memories: temporalMemories.map((memory) => ({
						id: memory.id,
						type: memory.type,
						contentPreview:
							memory.content.length <= 120
								? memory.content
								: `${memory.content.slice(0, 120)}...`,
						keywords: memory.keywords,
						similarity: memory.similarity ?? null,
						sourceTier: memory.sourceTier ?? null,
					})),
				});
				return temporalMemories;
			} catch (error) {
				await input.observer.failSpan(temporalRecallSpan.id, {
					query: retrievalPlan.queries.temporal,
					error: serializeError(error),
				});
				return [];
			}
		}

		await input.observer.skipStage(
			"temporal_recall",
			{
				strategy: temporalStrategy,
				query: retrievalPlan.queries.temporal,
			},
			{
				reason: input.embeddingConfig
					? temporalMode === "defer_to_tool"
						? "deferred_to_tool"
						: "activation_skipped"
					: "missing_memory_embedding_provider",
				memoryCount: 0,
			}
		);
		return [];
	})();

	const graphPromise = (async () => {
		if (!allowMemoryRecall) {
			await input.observer.skipStage(
				"graph_recall",
				{
					query: retrievalPlan.queries.graph,
				},
				{
					reason: "surface_policy_disabled",
					returnedItemCount: 0,
				}
			);
			return;
		}

		if (retrievalPlan.queries.graph) {
			const graphRecallSpan = await input.observer.startSpan("graph_recall", {
				query: retrievalPlan.queries.graph,
			});
			try {
				const result = await recallGraphMemory({
					profileId: input.profileId,
					plan: retrievalPlan,
				});
				await input.observer.completeSpan(graphRecallSpan.id, {
					seedNodeCount: result?.stats.seedNodeCount ?? 0,
					traversedEdgeCount: result?.stats.traversedEdgeCount ?? 0,
					returnedItemCount: result?.stats.returnedItemCount ?? 0,
					returnedItems:
						result?.items.map((item) => ({
							id: item.id,
							kind: item.kind,
							score: item.score,
							retrievalReason: item.retrievalReason,
							provenance: item.provenance,
						})) ?? [],
				});
				return result?.items;
			} catch (error) {
				await input.observer.failSpan(graphRecallSpan.id, {
					query: retrievalPlan.queries.graph,
					error: serializeError(error),
				});
				return;
			}
		}

		await input.observer.skipStage(
			"graph_recall",
			{
				query: retrievalPlan.queries.graph,
			},
			{
				reason: "activation_skipped",
				returnedItemCount: 0,
			}
		);
	})();

	const knowledgePromise = (async () => {
		if (!allowMemoryRecall) {
			await input.observer.skipStage(
				"knowledge_recall",
				{
					query: retrievalPlan.queries.knowledge,
					hasEmbeddingConfig: Boolean(input.embeddingConfig),
				},
				{
					reason: "surface_policy_disabled",
					returnedItemCount: 0,
				}
			);
			return;
		}

		if (retrievalPlan.queries.knowledge) {
			const knowledgeRecallSpan = await input.observer.startSpan(
				"knowledge_recall",
				{
					query: retrievalPlan.queries.knowledge,
					hasEmbeddingConfig: Boolean(input.embeddingConfig),
				}
			);
			try {
				const result = await recallKnowledge({
					profileId: input.profileId,
					plan: retrievalPlan,
					embeddingConfig: input.embeddingConfig,
				});
				await input.observer.completeSpan(knowledgeRecallSpan.id, {
					keywordHitCount: result?.stats.keywordHitCount ?? 0,
					vectorHitCount: result?.stats.vectorHitCount ?? 0,
					returnedItemCount: result?.stats.returnedItemCount ?? 0,
					returnedItems:
						result?.items.map((item) => ({
							id: item.id,
							kind: item.kind,
							score: item.score,
							retrievalReason: item.retrievalReason,
							provenance: item.provenance,
						})) ?? [],
				});
				return result?.items;
			} catch (error) {
				await input.observer.failSpan(knowledgeRecallSpan.id, {
					query: retrievalPlan.queries.knowledge,
					error: serializeError(error),
				});
				return;
			}
		}

		await input.observer.skipStage(
			"knowledge_recall",
			{
				query: retrievalPlan.queries.knowledge,
				hasEmbeddingConfig: Boolean(input.embeddingConfig),
			},
			{
				reason: "activation_skipped",
				returnedItemCount: 0,
			}
		);
	})();

	const [temporalMemories, graphEvidence, knowledgeEvidence] =
		await Promise.all([temporalPromise, graphPromise, knowledgePromise]);

	return {
		retrievalSignals,
		retrievalPlan,
		retrievedEvidence: {
			temporalMemories,
			graphEvidence,
			knowledgeEvidence,
			retrievalReason: retrievalPlan.reasons[0] ?? "hybrid",
		} satisfies RetrievedEvidence,
	};
};

export { runRetrieval };
