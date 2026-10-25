import type {
  Goal,
  StudyCheckResult,
  StudyGoalConfig,
  StudyGoalCreate,
  StudyLessonEnrich,
  StudyMastery,
  StudyPlanView,
  StudySession,
  StudySessionComplete,
  StudySessionReschedule,
} from "@neobuni/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

const STUDY_QUERY_KEY = ["study"] as const;

const invalidateStudy = (queryClient: ReturnType<typeof useQueryClient>) =>
  queryClient.invalidateQueries({ queryKey: STUDY_QUERY_KEY });

const useStudyGoals = () =>
  useQuery({
    queryKey: [...STUDY_QUERY_KEY, "goals"],
    queryFn: () => api.study.goals.list(),
    staleTime: 15_000,
  });

const useStudyToday = (goalId: string | null) =>
  useQuery({
    enabled: goalId !== null,
    queryKey: [...STUDY_QUERY_KEY, "today", goalId],
    queryFn: () => api.study.today({ goalId: goalId ?? "" }),
    staleTime: 15_000,
  });

interface StudyGoalDetail {
  config: StudyGoalConfig;
  goal: Goal;
  mastery: StudyMastery[];
  plan: StudyPlanView | null;
  sessions: StudySession[];
}

const useStudyGoalDetail = (goalId: string | null) =>
  useQuery<StudyGoalDetail>({
    enabled: goalId !== null,
    queryKey: [...STUDY_QUERY_KEY, "goal", goalId],
    queryFn: () => api.study.goals.get({ goalId: goalId ?? "" }),
    staleTime: 15_000,
  });

const useStudyProgress = (goalId: string | null) =>
  useQuery({
    enabled: goalId !== null,
    queryKey: [...STUDY_QUERY_KEY, "progress", goalId],
    queryFn: () => api.study.progress({ goalId: goalId ?? "" }),
    staleTime: 30_000,
  });

const useStartStudyGoal = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StudyGoalCreate) => api.study.goals.start(input),
    onSuccess: () => invalidateStudy(queryClient),
  });
};

const useUpdateStudyConfig = (goalId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: StudyGoalConfig) =>
      api.study.goals.updateConfig({ config, goalId }),
    onSuccess: () => invalidateStudy(queryClient),
  });
};

const useGenerateStudyPlan = (goalId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.study.plans.generate({ goalId }),
    onSuccess: () => invalidateStudy(queryClient),
  });
};

const useActivateStudyPlan = (goalId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) =>
      api.study.plans.activate({ goalId, planId }),
    onSuccess: () => invalidateStudy(queryClient),
  });
};

const useCompleteStudySession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StudySessionComplete) =>
      api.study.sessions.complete(input),
    onSuccess: () => invalidateStudy(queryClient),
  });
};

const useSkipStudySession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => api.study.sessions.skip({ sessionId }),
    onSuccess: () => invalidateStudy(queryClient),
  });
};

const useRescheduleStudySession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StudySessionReschedule) =>
      api.study.sessions.reschedule(input),
    onSuccess: () => invalidateStudy(queryClient),
  });
};

const useEnrichStudyLesson = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StudyLessonEnrich) => api.study.lessons.enrich(input),
    onSuccess: () => invalidateStudy(queryClient),
  });
};

const useSubmitStudyChecks = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      answers: Array<{ answer: string; promptId: string }>;
      sessionId: string;
    }): Promise<StudyCheckResult> => api.study.checks.submit(input),
    onSuccess: () => invalidateStudy(queryClient),
  });
};

export {
  STUDY_QUERY_KEY,
  useActivateStudyPlan,
  useCompleteStudySession,
  useEnrichStudyLesson,
  useGenerateStudyPlan,
  useRescheduleStudySession,
  useSkipStudySession,
  useStartStudyGoal,
  useStudyGoalDetail,
  useStudyGoals,
  useStudyProgress,
  useStudyToday,
  useSubmitStudyChecks,
  useUpdateStudyConfig,
};
