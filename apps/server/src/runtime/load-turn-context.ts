import type { SurfacePolicy } from "@neobuni/contracts";
import { buildTurnContext, getRecentUserTexts } from "@neobuni/core";
import {
	getAgentConfig as getAgentConfigFx,
	getMemoryEmbeddingProviderConfig as getMemoryEmbeddingProviderConfigFx,
	getMemoryReasoningProviderConfig as getMemoryReasoningProviderConfigFx,
	getProfile as getProfileFx,
	getProviderConfig as getProviderConfigFx,
	getSoulConfig as getSoulConfigFx,
	listCommitments as listCommitmentsFx,
	listGoals as listGoalsFx,
	listMessages as listMessagesFx,
	listRecentMemories as listRecentMemoriesFx,
	listRuntimeTurnsByConversation as listRuntimeTurnsByConversationFx,
	listSchedules as listSchedulesFx,
	listUnresolvedMemories as listUnresolvedMemoriesFx,
	runRepo,
	updateProfile as updateProfileFx,
} from "@neobuni/db";

const getAgentConfig = (...args: Parameters<typeof getAgentConfigFx>) =>
	runRepo(getAgentConfigFx(...args));
const getMemoryEmbeddingProviderConfig = (
	...args: Parameters<typeof getMemoryEmbeddingProviderConfigFx>
) => runRepo(getMemoryEmbeddingProviderConfigFx(...args));
const getMemoryReasoningProviderConfig = (
	...args: Parameters<typeof getMemoryReasoningProviderConfigFx>
) => runRepo(getMemoryReasoningProviderConfigFx(...args));
const getProfile = (...args: Parameters<typeof getProfileFx>) =>
	runRepo(getProfileFx(...args));
const getProviderConfig = (...args: Parameters<typeof getProviderConfigFx>) =>
	runRepo(getProviderConfigFx(...args));
const getSoulConfig = (...args: Parameters<typeof getSoulConfigFx>) =>
	runRepo(getSoulConfigFx(...args));
const listSchedules = (...args: Parameters<typeof listSchedulesFx>) =>
	runRepo(listSchedulesFx(...args));
const listMessages = (...args: Parameters<typeof listMessagesFx>) =>
	runRepo(listMessagesFx(...args));
const listGoals = (...args: Parameters<typeof listGoalsFx>) =>
	runRepo(listGoalsFx(...args));
const listCommitments = (...args: Parameters<typeof listCommitmentsFx>) =>
	runRepo(listCommitmentsFx(...args));
const listRecentMemories = (...args: Parameters<typeof listRecentMemoriesFx>) =>
	runRepo(listRecentMemoriesFx(...args));
const listRuntimeTurnsByConversation = (
	...args: Parameters<typeof listRuntimeTurnsByConversationFx>
) => runRepo(listRuntimeTurnsByConversationFx(...args));
const listUnresolvedMemories = (
	...args: Parameters<typeof listUnresolvedMemoriesFx>
) => runRepo(listUnresolvedMemoriesFx(...args));
const updateProfile = (...args: Parameters<typeof updateProfileFx>) =>
	runRepo(updateProfileFx(...args));

import { toOpenAICompatibleConfig } from "../digest/memory-provider-config";
import { normalizeTimeZone } from "../tools/datetime-utils";
import { applyMemoryPolicy, getSurfacePolicy } from "./surface-policy";

const TURN_CONTEXT_LIMITS = {
	unresolvedMemoryCount: 4,
	recentMemoryWindowDays: 3,
	recentMemoryCount: 6,
	recentUserTextCount: 4,
	recentRuntimeTurnCount: 4,
} as const;

const toMemorySlice = (memory: {
	id: string;
	content: string;
	type: "event" | "thought" | "preference" | "fact" | "task";
	keywords: string[];
	unresolved: boolean;
	createdAt: string;
}) => ({
	id: memory.id,
	content: memory.content,
	type: memory.type,
	keywords: memory.keywords,
	unresolved: memory.unresolved,
	createdAt: memory.createdAt,
});

type TurnContextMemoryLoadPlan = {
	shouldLoadMemoryState: boolean;
	unresolvedMemoryCount: number;
	recentMemoryWindowDays: number;
	recentMemoryCount: number;
};

type LoadedMemoryState = {
	unresolvedMemories: Awaited<ReturnType<typeof listUnresolvedMemories>>;
	recentMemories: Awaited<ReturnType<typeof listRecentMemories>>;
	memoryEmbedding: Awaited<ReturnType<typeof getMemoryEmbeddingProviderConfig>>;
	memoryReasoning: Awaited<ReturnType<typeof getMemoryReasoningProviderConfig>>;
};

const buildMemoryLoadPlan = (
	surfacePolicy: SurfacePolicy
): TurnContextMemoryLoadPlan => ({
	shouldLoadMemoryState:
		surfacePolicy.allowMemoryRecall || surfacePolicy.allowMemoryWrite,
	unresolvedMemoryCount: TURN_CONTEXT_LIMITS.unresolvedMemoryCount,
	recentMemoryWindowDays: TURN_CONTEXT_LIMITS.recentMemoryWindowDays,
	recentMemoryCount: TURN_CONTEXT_LIMITS.recentMemoryCount,
});

const loadMemoryContext = async (input: {
	profileId: string;
	plan: TurnContextMemoryLoadPlan;
}): Promise<LoadedMemoryState> => {
	if (!input.plan.shouldLoadMemoryState) {
		return {
			unresolvedMemories: [],
			recentMemories: [],
			memoryEmbedding: null,
			memoryReasoning: null,
		};
	}

	const [unresolvedMemories, recentMemories, memoryEmbedding, memoryReasoning] =
		await Promise.all([
			listUnresolvedMemories(input.profileId, input.plan.unresolvedMemoryCount),
			listRecentMemories(
				input.profileId,
				input.plan.recentMemoryWindowDays,
				input.plan.recentMemoryCount
			),
			getMemoryEmbeddingProviderConfig(input.profileId),
			getMemoryReasoningProviderConfig(input.profileId),
		]);

	return {
		unresolvedMemories,
		recentMemories,
		memoryEmbedding,
		memoryReasoning,
	};
};

const loadGoalPromptContext = async (input: {
	profileId: string;
	surfacePolicy: SurfacePolicy;
}) => {
	if (input.surfacePolicy.responseVisibility !== "private") {
		return { activeGoals: [], openCommitments: [] };
	}
	const [activeGoals, commitments] = await Promise.all([
		listGoals(input.profileId, "active"),
		listCommitments(input.profileId),
	]);
	return {
		activeGoals: activeGoals.slice(0, 5).map((goal) => ({
			id: goal.id,
			title: goal.title,
			desiredOutcome: goal.desiredOutcome,
			horizon: goal.horizon,
		})),
		openCommitments: commitments
			.filter(
				(commitment) =>
					commitment.status === "open" || commitment.status === "blocked"
			)
			.slice(0, 12)
			.map((commitment) => ({
				goalId: commitment.goalId,
				title: commitment.title,
				status:
					commitment.status === "blocked"
						? ("blocked" as const)
						: ("open" as const),
				dueAt: commitment.dueAt,
			})),
	};
};

const selectPreviousRuntimeTurns = (
	runtimeTurns: Awaited<ReturnType<typeof listRuntimeTurnsByConversation>>,
	currentTurnId: string
) =>
	runtimeTurns
		.filter((turn) => turn.id !== currentTurnId)
		.slice(0, TURN_CONTEXT_LIMITS.recentRuntimeTurnCount);

const loadTurnContext = async (input: {
	profileId: string;
	conversationId: string;
	latestUserText: string;
	clientTimezone: string | null;
	currentTurnId: string;
	surfacePolicy?: SurfacePolicy | null;
}) => {
	const referenceNow = new Date().toISOString();
	const defaultTimezone =
		Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	const surfacePolicy = input.surfacePolicy ?? getSurfacePolicy("chat_private");
	const memoryLoadPlan = buildMemoryLoadPlan(surfacePolicy);
	const [
		agentConfig,
		providerConfig,
		soulConfig,
		profile,
		schedules,
		persistedMessages,
		memoryState,
		runtimeTurns,
		goalContext,
	] = await Promise.all([
		getAgentConfig(input.profileId),
		getProviderConfig(input.profileId),
		getSoulConfig(input.profileId),
		getProfile(input.profileId),
		listSchedules(input.profileId),
		listMessages(input.conversationId),
		loadMemoryContext({
			profileId: input.profileId,
			plan: memoryLoadPlan,
		}),
		listRuntimeTurnsByConversation(input.profileId, input.conversationId),
		loadGoalPromptContext({
			profileId: input.profileId,
			surfacePolicy,
		}),
	]);

	const {
		unresolvedMemories,
		recentMemories,
		memoryEmbedding,
		memoryReasoning,
	} = memoryState;
	const embeddingConfig = toOpenAICompatibleConfig(memoryEmbedding);
	const reasoningConfig = toOpenAICompatibleConfig(memoryReasoning);
	const persistedClientTimezone =
		input.clientTimezone !== null &&
		normalizeTimeZone(input.clientTimezone) === input.clientTimezone
			? input.clientTimezone
			: null;
	const hydratedProfile =
		profile && profile.timezone === null && persistedClientTimezone !== null
			? ((await updateProfile(input.profileId, {
					timezone: persistedClientTimezone,
				})) ?? profile)
			: profile;
	const recentUserTexts = getRecentUserTexts(
		persistedMessages,
		TURN_CONTEXT_LIMITS.recentUserTextCount
	);
	const effectiveTimezone =
		persistedClientTimezone ?? hydratedProfile?.timezone ?? defaultTimezone;
	const previousRuntimeTurns = selectPreviousRuntimeTurns(
		runtimeTurns,
		input.currentTurnId
	);
	const previousRuntimeTurn = previousRuntimeTurns[0] ?? null;
	const memorySlices = applyMemoryPolicy({
		policy: surfacePolicy,
		unresolvedSlices: unresolvedMemories.map(toMemorySlice),
		recentSlices: recentMemories.map(toMemorySlice),
	});

	const turnContext = buildTurnContext({
		turnInput: {
			profileId: input.profileId,
			conversationId: input.conversationId,
			latestUserText: input.latestUserText,
			timezone: persistedClientTimezone,
			now: referenceNow,
		},
		recentUserTexts,
		unresolvedSlices: memorySlices.unresolvedSlices,
		recentSlices: memorySlices.recentSlices,
		signalContext: {
			schedules: schedules.map((schedule) => ({
				id: schedule.id,
				type: schedule.type,
				title: schedule.title,
				triggerAt: schedule.triggerAt,
				timezone: schedule.timezone,
				status: schedule.status,
			})),
			recentRuntimeTurns: previousRuntimeTurns.map((turn) => ({
				id: turn.id,
				status: turn.status,
				protectiveLevel: turn.protectiveLevel,
				primaryStance: turn.primaryStance,
				memoryRecallStrategy: turn.memoryRecallStrategy,
				toolCallCount: turn.toolCallCount,
				startedAt: turn.startedAt,
			})),
			environment: {
				effectiveTimezone,
			},
		},
		previousRuntimeState: previousRuntimeTurn
			? {
					protectiveLevel: previousRuntimeTurn.protectiveLevel,
					primaryStance: previousRuntimeTurn.primaryStance,
					memoryRecallStrategy: previousRuntimeTurn.memoryRecallStrategy,
				}
			: null,
	});

	return {
		referenceNow,
		defaultTimezone,
		agentConfig,
		providerConfig,
		soulConfig,
		profile: hydratedProfile,
		schedules,
		persistedMessages,
		memoryEmbedding,
		memoryReasoning,
		goalContext,
		embeddingConfig,
		reasoningConfig,
		effectiveTimezone,
		turnContext,
	};
};

export { loadGoalPromptContext, loadTurnContext, TURN_CONTEXT_LIMITS };
