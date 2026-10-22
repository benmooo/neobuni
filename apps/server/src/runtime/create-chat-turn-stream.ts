import type { SurfacePolicy, WorkingMemory } from "@neobuni/contracts";
import {
	type RetrievedEvidence,
	runTurnKernel,
	summarizeSignalSet,
} from "@neobuni/core";
import {
	getDigestAnchor as getDigestAnchorFx,
	getProviderConfig as getProviderConfigFx,
	listMessages as listMessagesFx,
	runRepo,
} from "@neobuni/db";
import {
	type JSONSchema,
	mergeAgentTools,
	type StreamChunk,
} from "@tanstack/ai";

const getDigestAnchor = (...args: Parameters<typeof getDigestAnchorFx>) =>
	runRepo(getDigestAnchorFx(...args));
const getProviderConfig = (...args: Parameters<typeof getProviderConfigFx>) =>
	runRepo(getProviderConfigFx(...args));
const listMessages = (...args: Parameters<typeof listMessagesFx>) =>
	runRepo(listMessagesFx(...args));

import { recordEvidenceRelevanceShadow } from "../decision/evidence-relevance-shadow-service";
import { runManualDigest } from "../digest/digest-pipeline";
import { getDigestThreshold } from "../digest/memory-provider-config";
import { createChatToolSet, createExecutionTools } from "../tools";
import {
	buildProviderRequestInput,
	previewText,
} from "./compile-provider-request";
import { loadTurnContext } from "./load-turn-context";
import {
	persistAssistantTurnMessage,
	persistUserTurnMessage,
} from "./persist-turn-result";
import { runAgentTurn } from "./run-agent-turn";
import { runRetrieval } from "./run-retrieval";
import { createRuntimeObserver } from "./runtime-observer";
import {
	filterToolNamesForSurfacePolicy,
	getSurfacePolicy,
} from "./surface-policy";
import { applySurfacePromptPolicy } from "./surface-prompt";

type ChatTurnStreamInput = {
	profileId: string;
	conversationId: string;
	threadId: string;
	abortController: AbortController;
	clientTimezone: string | null;
	latestUserText: string;
	clientTools: Array<{
		name: string;
		description: string;
		parameters: JSONSchema;
	}>;
	surfacePolicy?: SurfacePolicy | null;
};

const DEFAULT_PROVIDER_STREAM_IDLE_TIMEOUT_MS = 90_000;

const providerStreamIdleTimeoutMs = (() => {
	const rawValue = Number(
		process.env.NEOBUNI_PROVIDER_STREAM_IDLE_TIMEOUT_MS ??
			DEFAULT_PROVIDER_STREAM_IDLE_TIMEOUT_MS
	);

	return Number.isFinite(rawValue) && rawValue > 0
		? Math.floor(rawValue)
		: DEFAULT_PROVIDER_STREAM_IDLE_TIMEOUT_MS;
})();

const createError = (name: string, message: string) => {
	const error = new Error(message);
	error.name = name;
	return error;
};

const computeHash = async (value: string) => {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)]
		.map((part) => part.toString(16).padStart(2, "0"))
		.join("");
};

const queueAutoDigestCheck = (input: {
	profileId: string;
	conversationId: string;
	reasoningConfig: {
		apiKey: string;
		model: string;
		baseUrl?: string | undefined;
	} | null;
	embeddingConfig: {
		apiKey: string;
		model: string;
		baseUrl?: string | undefined;
	} | null;
	threshold: number;
}) => {
	if (!(input.reasoningConfig && input.embeddingConfig)) {
		return;
	}

	const reasoningConfig = input.reasoningConfig;
	const embeddingConfig = input.embeddingConfig;

	queueMicrotask(async () => {
		try {
			const anchor = await getDigestAnchor(
				input.profileId,
				input.conversationId
			);
			const allMessages = await listMessages(input.conversationId);
			const undigested = anchor
				? allMessages.filter(
						(message) => message.createdAt > anchor.lastMessageTs
					)
				: allMessages;

			if (undigested.length >= input.threshold) {
				await runManualDigest(
					input.profileId,
					input.conversationId,
					reasoningConfig,
					embeddingConfig
				);
			}
		} catch (error) {
			console.warn("Auto-digest check failed:", error);
		}
	});
};

const countWorkingMemoryItems = (workingMemory: WorkingMemory | undefined) =>
	(workingMemory?.relationshipState.length ?? 0) +
	(workingMemory?.emotionalState.length ?? 0) +
	(workingMemory?.personalContext.length ?? 0) +
	(workingMemory?.activeTasks.length ?? 0) +
	(workingMemory?.worldFacts.length ?? 0);

const filterServerToolsBySurfacePolicy = <T extends { name: string }>(
	tools: readonly T[],
	policy: SurfacePolicy
) => {
	const filteredToolNames = filterToolNamesForSurfacePolicy(
		tools.map((tool) => tool.name),
		policy
	);
	const allowed = new Set(
		policy.toolAllowlist === null
			? filteredToolNames
			: filteredToolNames.filter((toolName) =>
					policy.toolAllowlist?.includes(toolName)
				)
	);

	return tools.filter((tool) => allowed.has(tool.name));
};

type StreamQueueItem =
	| { type: "chunk"; chunk: StreamChunk }
	| { type: "done" }
	| { type: "error"; error: unknown };

const createStreamQueue = () => {
	const buffered: StreamQueueItem[] = [];
	let pendingResolve: ((item: StreamQueueItem) => void) | null = null;

	const push = (item: StreamQueueItem) => {
		if (pendingResolve) {
			const resolve = pendingResolve;
			pendingResolve = null;
			resolve(item);
			return;
		}

		buffered.push(item);
	};

	const next = () => {
		const item = buffered.shift();
		if (item) {
			return Promise.resolve(item);
		}

		return new Promise<StreamQueueItem>((resolve) => {
			pendingResolve = resolve;
		});
	};

	return {
		next,
		push,
	};
};

const createChatTurnStream = async ({
	profileId,
	conversationId,
	threadId,
	abortController,
	clientTimezone,
	latestUserText,
	clientTools,
	surfacePolicy,
}: ChatTurnStreamInput) => {
	const effectiveSurfacePolicy =
		surfacePolicy ?? getSurfacePolicy("chat_private");
	const initialProviderConfig = await getProviderConfig(profileId);
	const observer = await createRuntimeObserver({
		profileId,
		conversationId,
		providerKey: initialProviderConfig.provider,
		modelKey: initialProviderConfig.model,
	});
	let turnFinalized = false;
	let providerIdleTimer: ReturnType<typeof setTimeout> | null = null;

	const clearProviderIdleTimer = () => {
		if (providerIdleTimer !== null) {
			clearTimeout(providerIdleTimer);
			providerIdleTimer = null;
		}
	};

	const finalizeTurn = async (
		input:
			| { status: "completed" }
			| { status: "aborted"; error?: unknown }
			| { status: "failed"; errorCode: string; error?: unknown }
	) => {
		if (turnFinalized) {
			return false;
		}

		turnFinalized = true;
		clearProviderIdleTimer();
		abortController.signal.removeEventListener("abort", handleAbort);

		if (input.status === "completed") {
			await observer.completeTurn();
			return true;
		}

		if (input.status === "aborted") {
			await observer.abortTurn(input.error);
			return true;
		}

		await observer.failTurn(input.errorCode, input.error);
		return true;
	};

	const handleAbort = () => {
		const reason =
			abortController.signal.reason ??
			createError("AbortError", "Chat request aborted");

		void finalizeTurn({
			status: "aborted",
			error: reason,
		});
	};

	const scheduleProviderIdleTimeout = () => {
		clearProviderIdleTimer();

		if (turnFinalized) {
			return;
		}

		providerIdleTimer = setTimeout(() => {
			const error = createError(
				"ProviderStreamIdleTimeoutError",
				`Provider stream was idle for ${providerStreamIdleTimeoutMs}ms`
			);

			void finalizeTurn({
				status: "failed",
				errorCode: "provider_stream_timeout",
				error,
			});

			if (!abortController.signal.aborted) {
				abortController.abort(error);
			}
		}, providerStreamIdleTimeoutMs);
	};

	abortController.signal.addEventListener("abort", handleAbort, {
		once: true,
	});

	if (abortController.signal.aborted) {
		handleAbort();
	}

	const requestSpan = await observer.startSpan("request_received", {
		conversationId,
		inputPreview: previewText(latestUserText),
	});
	await observer.completeSpan(requestSpan.id, {
		accepted: true,
	});

	const userPersistSpan = await observer.startSpan("user_message_persist", {
		contentLength: latestUserText.length,
	});
	const userMessage = await persistUserTurnMessage({
		conversationId,
		turnId: observer.turnId,
		latestUserText,
	});
	await observer.setRequestMessageId(userMessage.id);
	await observer.completeSpan(userPersistSpan.id, {
		messageId: userMessage.id,
		createdAt: userMessage.createdAt,
	});

	const contextSpan = await observer.startSpan("turn_context_load", {
		conversationId,
		profileId,
	});
	const loadedContext = await loadTurnContext({
		profileId,
		conversationId,
		latestUserText,
		clientTimezone,
		currentTurnId: observer.turnId,
		surfacePolicy: effectiveSurfacePolicy,
	});
	await observer.completeSpan(contextSpan.id, {
		recentUserTextCount: loadedContext.turnContext.recentUserTexts.length,
		unresolvedSliceCount: loadedContext.turnContext.unresolvedSlices.length,
		recentSliceCount: loadedContext.turnContext.recentSlices.length,
		scheduleContextCount:
			loadedContext.turnContext.signalContext.schedules.length,
		recentRuntimeTurnCount:
			loadedContext.turnContext.signalContext.recentRuntimeTurns.length,
		effectiveTimezone:
			loadedContext.turnContext.signalContext.environment.effectiveTimezone,
		hasPreviousRuntimeState: Boolean(
			loadedContext.turnContext.previousRuntimeState
		),
	});

	const goalContextSpan = await observer.startSpan("goal_context_load", {
		responseVisibility: effectiveSurfacePolicy.responseVisibility,
	});
	await observer.completeSpan(goalContextSpan.id, {
		activeGoalCount: loadedContext.goalContext.activeGoals.length,
		openCommitmentCount: loadedContext.goalContext.openCommitments.length,
		includedInPrompt:
			loadedContext.goalContext.activeGoals.length > 0 ||
			loadedContext.goalContext.openCommitments.length > 0,
	});

	const signalSpan = await observer.startSpan("signal_normalization", {
		latestUserTextLength: latestUserText.length,
	});
	const signalProfile = summarizeSignalSet(loadedContext.turnContext.signals);
	await observer.completeSpan(signalSpan.id, {
		textSignalCount: loadedContext.turnContext.signals.textSignals.length,
		memorySignalCount: loadedContext.turnContext.signals.memorySignals.length,
		scheduleSignalCount:
			loadedContext.turnContext.signals.scheduleSignals.length,
		behavioralSignalCount:
			loadedContext.turnContext.signals.behavioralSignals.length,
		environmentalSignalCount:
			loadedContext.turnContext.signals.environmentalSignals.length,
		totalSignalCount: signalProfile.totalSignalCount,
		weakSignalCount: signalProfile.weakSignalCount,
		mediumSignalCount: signalProfile.mediumSignalCount,
		strongSignalCount: signalProfile.strongSignalCount,
		observeSignalCount: signalProfile.observeSignalCount,
		contextHintSignalCount: signalProfile.contextHintSignalCount,
		decisionSignalCount: signalProfile.decisionSignalCount,
		categoryCounts: signalProfile.categoryCounts,
		topSignals: signalProfile.topSignals,
	});

	const retrieval = await runRetrieval({
		profileId,
		turnContext: loadedContext.turnContext,
		allowMemoryRecall: effectiveSurfacePolicy.allowMemoryRecall,
		embeddingConfig: loadedContext.embeddingConfig,
		observer,
	});

	const kernelResult = runTurnKernel({
		turnContext: loadedContext.turnContext,
		soulConfig: loadedContext.soulConfig,
		agentConfig: loadedContext.agentConfig,
		retrievedEvidence: retrieval.retrievedEvidence as RetrievedEvidence,
		goalContext: loadedContext.goalContext,
	});

	const evidenceRelevanceShadow = await runRepo(
		recordEvidenceRelevanceShadow({
			profileId,
			latestUserText,
			evidence: kernelResult.fusedEvidence,
			trigger: "chat_evidence_relevance",
		})
	).catch(() => ({ status: "failed" as const, evidenceIds: [] as string[] }));

	const evidenceFusionSpan = await observer.startSpan("evidence_fusion", {
		stores: retrieval.retrievalPlan.stores,
	});
	observer.updateSummary({
		memoryCount: kernelResult.fusedEvidence.length,
	});
	await observer.completeSpan(evidenceFusionSpan.id, {
		temporalInputCount: kernelResult.temporalEvidence.length,
		graphInputCount: retrieval.retrievedEvidence.graphEvidence?.length ?? 0,
		knowledgeInputCount:
			retrieval.retrievedEvidence.knowledgeEvidence?.length ?? 0,
		fusedCount: kernelResult.fusedEvidence.length,
		evidenceRelevanceShadow: {
			status: evidenceRelevanceShadow.status,
			evidenceIds: evidenceRelevanceShadow.evidenceIds,
		},
		returnedItems: kernelResult.fusedEvidence.map((item) => ({
			id: item.id,
			store: item.store,
			kind: item.kind,
			score: item.score,
			retrievalReason: item.retrievalReason,
			sourceTier: item.metadata.sourceTier ?? null,
		})),
	});

	const workingMemorySpan = await observer.startSpan("working_memory_build", {
		fusedCount: kernelResult.fusedEvidence.length,
	});
	await observer.completeSpan(workingMemorySpan.id, {
		focus: kernelResult.workingMemory.focus,
		relationshipStateCount: kernelResult.workingMemory.relationshipState.length,
		emotionalStateCount: kernelResult.workingMemory.emotionalState.length,
		personalContextCount: kernelResult.workingMemory.personalContext.length,
		activeTaskCount: kernelResult.workingMemory.activeTasks.length,
		worldFactCount: kernelResult.workingMemory.worldFacts.length,
		openLoopCount: kernelResult.workingMemory.openLoops.length,
		constraintCount: kernelResult.workingMemory.constraints.length,
		actionCandidateCount: kernelResult.workingMemory.actionCandidates.length,
		constraints: kernelResult.workingMemory.constraints,
		actionCandidates: kernelResult.workingMemory.actionCandidates,
		signalDrivers: kernelResult.expressionSignalDrivers,
	});

	const soulDecisionSpan = await observer.startSpan("soul_decision", {
		latestUserText: previewText(latestUserText),
		recentUserTextCount: loadedContext.turnContext.recentUserTexts.length,
		memoryCount: retrieval.retrievedEvidence.temporalMemories.length,
	});
	observer.updateSummary({
		protectiveLevel: kernelResult.soulRuntime.protectiveDecision.level ?? null,
		primaryStance: kernelResult.soulRuntime.stanceDecision.primary ?? null,
		memoryCount: kernelResult.fusedEvidence.length,
	});
	await observer.completeSpan(soulDecisionSpan.id, {
		appraisal: kernelResult.soulRuntime.appraisal,
		protectiveDecision: kernelResult.soulRuntime.protectiveDecision,
		effectiveDriveOrder: kernelResult.soulRuntime.effectiveDriveOrder,
		stanceDecision: kernelResult.soulRuntime.stanceDecision,
		signalDrivers: kernelResult.expressionSignalDrivers,
	});

	const responseSpecSpan = await observer.startSpan("response_spec_build", {
		stance: kernelResult.responseSpec.stance,
	});
	await observer.completeSpan(responseSpecSpan.id, {
		...kernelResult.responseSpec,
		expressionContext: kernelResult.textExpressionContext,
		signalDrivers: kernelResult.expressionSignalDrivers,
		compiledExpressionSet: kernelResult.expressionSet,
		rendererState: kernelResult.rendererState,
	});

	const promptCompileSpan = await observer.startSpan("prompt_compile", {
		memoryCount: retrieval.retrievedEvidence.temporalMemories.length,
		hasSoulRuntime: true,
	});
	const surfacePromptPacket = applySurfacePromptPolicy({
		promptPacket: kernelResult.promptPacket,
		surfacePolicy: effectiveSurfacePolicy,
	});
	const promptHash = await computeHash(surfacePromptPacket.systemPrompt);
	await observer.completeSpan(promptCompileSpan.id, {
		promptHash,
		systemPromptLength: surfacePromptPacket.systemPrompt.length,
		promptSectionCount: surfacePromptPacket.sections.length,
		promptSections: surfacePromptPacket.sections.map((section, index) => ({
			index,
			key: section.key,
			title: section.title,
			bodyLength: section.body.length,
		})),
		compiledExpressionChannels: surfacePromptPacket.compiledExpression
			? Object.keys(surfacePromptPacket.compiledExpression)
			: [],
		memoryCount: retrieval.retrievedEvidence.temporalMemories.length,
		workingMemoryCount: countWorkingMemoryItems(kernelResult.workingMemory),
		hasSoulRuntime: true,
	});

	if (effectiveSurfacePolicy.allowMemoryWrite) {
		queueAutoDigestCheck({
			profileId,
			conversationId,
			reasoningConfig: loadedContext.reasoningConfig,
			embeddingConfig: loadedContext.embeddingConfig,
			threshold: getDigestThreshold(loadedContext.memoryReasoning),
		});
	}

	const toolContext = {
		profileId,
		conversationId,
		turnId: observer.turnId,
		clientTimezone,
		profileTimezone: loadedContext.profile?.timezone ?? null,
		defaultTimezone: loadedContext.defaultTimezone,
		referenceNow: loadedContext.referenceNow,
		embeddingConfig: loadedContext.embeddingConfig,
		abortSignal: abortController.signal,
	} as const;

	const serverTools = filterServerToolsBySurfacePolicy(
		effectiveSurfacePolicy.allowMemoryRecall ||
			effectiveSurfacePolicy.allowMemoryWrite
			? createChatToolSet(toolContext)
			: createExecutionTools(toolContext),
		effectiveSurfacePolicy
	);

	const tools = [...mergeAgentTools(serverTools, clientTools)];

	const providerRequestInput = buildProviderRequestInput({
		providerKey: loadedContext.providerConfig.provider,
		modelKey: loadedContext.providerConfig.model,
		persistedMessages: loadedContext.persistedMessages,
		promptPacket: surfacePromptPacket,
		toolNames: tools.map((tool) => tool.name),
	});

	const queue = createStreamQueue();

	void (async () => {
		try {
			scheduleProviderIdleTimeout();

			const result = await runAgentTurn({
				observer,
				abortController,
				providerConfig: loadedContext.providerConfig,
				conversationId,
				threadId,
				promptPacket: surfacePromptPacket,
				persistedMessages: loadedContext.persistedMessages,
				tools,
				providerRequestInput,
				initialPersistedMessageCount: loadedContext.persistedMessages.length,
				onChunk: async (chunk) => {
					if (turnFinalized) {
						return;
					}

					scheduleProviderIdleTimeout();
					queue.push({
						type: "chunk",
						chunk,
					});
				},
			});

			clearProviderIdleTimer();

			if (turnFinalized) {
				queue.push({ type: "done" });
				return;
			}

			const providerOutcome = result.providerTurnResolution.providerOutcome;

			if (result.providerTurnResolution.status === "aborted") {
				await finalizeTurn({
					status: "aborted",
					error: result.providerTurnResolution.error,
				});
				queue.push({ type: "done" });
				return;
			}

			if (result.providerTurnResolution.status === "failed") {
				await finalizeTurn({
					status: "failed",
					errorCode: result.providerTurnResolution.errorCode,
					error: result.providerTurnResolution.error,
				});
				queue.push({ type: "done" });
				return;
			}

			try {
				if (result.assistantText.trim().length > 0) {
					const assistantPersistSpan = await observer.startSpan(
						"assistant_message_persist",
						{
							contentLength: result.assistantText.length,
							providerOutcome,
						}
					);

					const assistantMessage = await persistAssistantTurnMessage({
						conversationId,
						turnId: observer.turnId,
						assistantText: result.assistantText,
						rendererState: kernelResult.rendererState,
						metadata: {
							...(result.transcript
								? {
										transcript: result.transcript,
									}
								: {}),
						},
					});
					await observer.setResponseMessageId(assistantMessage.id);
					await observer.completeSpan(assistantPersistSpan.id, {
						messageId: assistantMessage.id,
						createdAt: assistantMessage.createdAt,
						contentLength: result.assistantText.length,
						providerOutcome,
					});
				} else {
					await observer.skipStage(
						"assistant_message_persist",
						{
							contentLength: result.assistantText.length,
							providerOutcome,
						},
						{
							reason:
								result.assistantText.length > 0
									? "blank_assistant_text"
									: "empty_assistant_text",
							providerOutcome,
						}
					);
				}

				await finalizeTurn({
					status: "completed",
				});
				queue.push({ type: "done" });
			} catch (error) {
				await finalizeTurn({
					status: "failed",
					errorCode: "assistant_persist_failed",
					error,
				});
				queue.push({
					type: "error",
					error,
				});
			}
		} catch (error) {
			clearProviderIdleTimer();

			if (abortController.signal.aborted) {
				await finalizeTurn({
					status: "aborted",
					error,
				});
				queue.push({ type: "done" });
				return;
			}

			await finalizeTurn({
				status: "failed",
				errorCode: "provider_stream_failed",
				error,
			});
			queue.push({
				type: "error",
				error,
			});
		}
	})();

	return (async function* () {
		while (true) {
			const item = await queue.next();

			if (item.type === "chunk") {
				yield item.chunk;
				continue;
			}

			if (item.type === "error") {
				throw item.error;
			}

			return;
		}
	})();
};

export { createChatTurnStream };
