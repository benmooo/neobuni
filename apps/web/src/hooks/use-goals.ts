import {
	type AutonomyMode,
	actionRunSchema,
	decisionEvaluationReportSchema,
	goalSchema,
	type NowOverview,
	nowOverviewSchema,
	telegramChannelTargetSchema,
} from "@neobuni/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

const GOALS_QUERY_KEY = ["goals"] as const;
const useNowOverview = () =>
	useQuery({
		queryKey: [...GOALS_QUERY_KEY, "now"],
		queryFn: async () => nowOverviewSchema.parse(await api.goals.now()),
		staleTime: 15_000,
	});
const useGoals = () =>
	useQuery({
		queryKey: GOALS_QUERY_KEY,
		queryFn: async () => goalSchema.array().parse(await api.goals.list()),
		staleTime: 15_000,
	});
const useTelegramChannelTargets = () =>
	useQuery({
		queryKey: [...GOALS_QUERY_KEY, "telegram-channel-targets"],
		queryFn: async () =>
			telegramChannelTargetSchema
				.array()
				.parse(await api.goals.telegramTargets()),
		staleTime: 15_000,
	});
const useActionRun = (actionRunId: string | null) =>
	useQuery({
		queryKey: [...GOALS_QUERY_KEY, "action-runs", actionRunId],
		queryFn: async () =>
			actionRunSchema.parse(
				await api.goals.actionRuns.get({ actionRunId: actionRunId ?? "" })
			),
		enabled: actionRunId !== null,
		refetchInterval: (query) =>
			query.state.data?.status === "succeeded" ||
			query.state.data?.status === "failed" ||
			query.state.data?.status === "cancelled"
				? false
				: 2000,
	});
const useDecisionEvaluation = () =>
	useQuery({
		queryKey: [...GOALS_QUERY_KEY, "decision-evaluation"],
		queryFn: async () =>
			decisionEvaluationReportSchema.parse(
				await api.goals.decisionEvaluation()
			),
		staleTime: 30_000,
	});
const useCreateActiveGoal = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			title: string;
			desiredOutcome: string;
			autonomyMode?: AutonomyMode;
		}) =>
			api.goals.create({
				title: input.title,
				desiredOutcome: input.desiredOutcome,
				status: "active",
				horizon: "project",
				successCriteria: [],
				constraints: [],
				autonomyMode: input.autonomyMode ?? "collaborate",
				planVersion: 0,
				nextReviewAt: null,
			}),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: GOALS_QUERY_KEY }),
	});
};
const useUpdateGoalStatus = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			goalId: string;
			status: "active" | "paused" | "completed" | "abandoned";
		}) => api.goals.update({ goalId: input.goalId, status: input.status }),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: GOALS_QUERY_KEY }),
	});
};
const useCreateCommitment = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { goalId: string; title: string }) =>
			api.goals.commitments.create({
				goalId: input.goalId,
				kind: "task",
				status: "open",
				owner: "user",
				title: input.title,
				dueAt: null,
				evidenceIds: [],
			}),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: GOALS_QUERY_KEY }),
	});
};
const useUpdateCommitmentStatus = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			goalId: string;
			commitmentId: string;
			status: "open" | "blocked" | "done" | "cancelled";
		}) =>
			api.goals.commitments.update({
				goalId: input.goalId,
				commitmentId: input.commitmentId,
				status: input.status,
			}),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: GOALS_QUERY_KEY }),
	});
};
const useEvaluateNextAction = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (
			input: { goalId?: string } = {}
		): Promise<{
			decision: { id: string };
			suggestedAction: NowOverview["suggestedAction"];
		}> => api.goals.nextActionEvaluations(input),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: GOALS_QUERY_KEY }),
	});
};
const useDecisionFeedback = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			decisionId: string;
			kind: "accepted" | "dismissed" | "deferred";
			candidateId?: string;
		}) =>
			api.goals.decisions.feedback({
				decisionId: input.decisionId,
				kind: input.kind,
				candidateId: input.candidateId,
			}),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: GOALS_QUERY_KEY }),
	});
};
const useCompleteSuggestedCommitment = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: {
			decisionId: string;
			candidateId: string;
			commitmentId: string;
			expectedStatus: NowOverview["openCommitments"][number]["status"];
		}) => {
			const proposal = await api.goals.actionProposals.create({
				decisionId: input.decisionId,
				candidateId: input.candidateId,
				expectedOutcome: "将承诺标记为已完成。",
				input: {},
			});
			const authorization = await api.goals.actionProposals.authorize({
				proposalId: proposal.id,
				mode: "execute",
				constraints: { scope: "single_commitment" },
			});
			return api.goals.actionProposals.createRun({
				proposalId: proposal.id,
				authorizationId: authorization.id,
				input: {
					operation: "commitment_status_update",
					commitmentId: input.commitmentId,
					expectedStatus: input.expectedStatus,
					nextStatus: "done",
				},
			});
		},
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: GOALS_QUERY_KEY }),
	});
};
const useCreateTelegramDraft = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			goalId?: string;
			targetAlias: string;
			text: string;
			expectedOutcome: string;
		}) => api.goals.telegramDrafts(input),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: GOALS_QUERY_KEY }),
	});
};
const useConfirmTelegramSend = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: {
			proposalId: string;
			targetAlias: string;
			text: string;
		}) => {
			const authorization = await api.goals.actionProposals.authorize({
				proposalId: input.proposalId,
				mode: "execute",
				constraints: {
					platform: "telegram",
					targetAlias: input.targetAlias,
					requiresConfirmation: true,
				},
			});
			return api.goals.actionProposals.createRun({
				proposalId: input.proposalId,
				authorizationId: authorization.id,
				input: {
					operation: "telegram_message_send",
					messageKind: "daily_summary",
					targetAlias: input.targetAlias,
					targetId: null,
					text: input.text,
				},
			});
		},
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: GOALS_QUERY_KEY }),
	});
};
const useConfirmActionReceipt = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (actionRunId: string) =>
			api.goals.actionRuns.confirmReceipt({ actionRunId }),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: GOALS_QUERY_KEY }),
	});
};

export {
	GOALS_QUERY_KEY,
	useActionRun,
	useCompleteSuggestedCommitment,
	useConfirmActionReceipt,
	useConfirmTelegramSend,
	useCreateActiveGoal,
	useCreateCommitment,
	useCreateTelegramDraft,
	useDecisionEvaluation,
	useDecisionFeedback,
	useEvaluateNextAction,
	useGoals,
	useNowOverview,
	useTelegramChannelTargets,
	useUpdateCommitmentStatus,
	useUpdateGoalStatus,
};
