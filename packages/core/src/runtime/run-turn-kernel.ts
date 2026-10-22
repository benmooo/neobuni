import type {
	EvidenceItem,
	ExpressionContext,
	ExpressionSignalDriver,
	GoalPromptContext,
	RetrievalReason,
	SoulConfig,
	TurnContext,
} from "@neobuni/contracts";

import { buildMemoryFusionResult } from "../cognition/memory-fusion";
import { buildRendererState, compileExpressionSet } from "../expression";
import { summarizeSignalSet } from "../perception";
import { compilePromptPacket } from "../prompt/compile-prompt-packet";
import { buildSoulDecision } from "./build-soul-decision";

type RecalledMemory = {
	id?: string;
	content: string;
	type: string;
	keywords: string[];
	importance?: number;
	similarity?: number;
	sourceTier?: "vector_hit" | "unresolved_carryover" | "recent_continuity";
	unresolved?: boolean;
};

type RetrievedEvidence = {
	temporalMemories: RecalledMemory[];
	graphEvidence?: EvidenceItem[];
	knowledgeEvidence?: EvidenceItem[];
	retrievalReason: RetrievalReason;
};

const runTurnKernel = (input: {
	turnContext: TurnContext;
	soulConfig: SoulConfig;
	agentConfig: {
		aiName: string;
		userName: string;
		userPersona: string;
	};
	retrievedEvidence: RetrievedEvidence;
	goalContext?: GoalPromptContext;
}) => {
	const memoryFusion = buildMemoryFusionResult({
		temporalMemories: input.retrievedEvidence.temporalMemories,
		graphEvidence: input.retrievedEvidence.graphEvidence,
		knowledgeEvidence: input.retrievedEvidence.knowledgeEvidence,
		retrievalReason: input.retrievedEvidence.retrievalReason,
		signals: input.turnContext.signals,
	});

	const { soulRuntime, responseSpec } = buildSoulDecision({
		soulConfig: input.soulConfig,
		latestUserText: input.turnContext.input.latestUserText,
		recentUserTexts: input.turnContext.recentUserTexts,
		signals: input.turnContext.signals,
		previousRuntimeState: input.turnContext.previousRuntimeState,
		memories:
			input.retrievedEvidence.temporalMemories.length > 0
				? input.retrievedEvidence.temporalMemories.map((memory) => ({
						content: memory.content,
						type: memory.type,
						keywords: memory.keywords,
					}))
				: undefined,
	});
	const signalProfile = summarizeSignalSet(input.turnContext.signals);
	const signalDrivers = signalProfile.topSignals.filter(
		(signal) => signal.consumptionMode !== "observe"
	) as ExpressionSignalDriver[];
	const textExpressionContext: ExpressionContext = {
		userIntent: soulRuntime.appraisal.userIntent,
		emotionalLoad: soulRuntime.appraisal.emotionalLoad,
		vulnerability: soulRuntime.appraisal.vulnerability,
		protectiveLevel: soulRuntime.protectiveDecision.level,
		primaryStance: soulRuntime.stanceDecision.primary,
		workingMemoryFocus: memoryFusion.workingMemory.focus,
	};
	const expressionSet = compileExpressionSet({
		responseSpec,
		context: textExpressionContext,
		signalDrivers,
	});
	const rendererState = buildRendererState({
		expressionSet,
		context: textExpressionContext,
		responseSpec,
	});
	const promptPacket = compilePromptPacket({
		aiName: input.agentConfig.aiName,
		userName: input.agentConfig.userName,
		userPersona: input.agentConfig.userPersona,
		memories:
			input.retrievedEvidence.temporalMemories.length > 0
				? input.retrievedEvidence.temporalMemories.map((memory) => ({
						content: memory.content,
						type: memory.type,
						keywords: memory.keywords,
					}))
				: undefined,
		workingMemory: memoryFusion.workingMemory,
		soulRuntime,
		expressionSet,
		goalContext: input.goalContext,
	});

	return {
		retrievalReason: input.retrievedEvidence.retrievalReason,
		temporalEvidence: memoryFusion.temporalEvidence,
		fusedEvidence: memoryFusion.fusedEvidence,
		workingMemory: memoryFusion.workingMemory,
		soulRuntime,
		responseSpec,
		expressionSignalDrivers: signalDrivers,
		textExpressionContext,
		expressionSet,
		rendererState,
		textExpression: expressionSet.text,
		systemPrompt: promptPacket.systemPrompt,
		promptPacket,
	};
};

export type { RetrievedEvidence };
export { runTurnKernel };
