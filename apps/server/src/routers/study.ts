import { protectedProcedure, run } from "@neobuni/api";
import {
  type StudyGoalConfig,
  type StudyPlanView,
  type StudySession,
  type StudySessionWithNode,
  type StudyToday,
  studyGoalCreateSchema,
  studyGoalParamSchema,
  studyPlanActivateSchema,
  studyPlanGenerateSchema,
  studyProgressInputSchema,
  studySessionCompleteSchema,
  studySessionIdSchema,
  studySessionRescheduleSchema,
} from "@neobuni/contracts";
import {
  buildStudyPlanDraft,
  computeStudyProgress,
  countStudyDays,
  diffLocalDays,
  getStudyTemplate,
  localDateInTimeZone,
  localDateTimeInTimeZone,
  scheduleStudySessions,
  selectNextStudySession,
} from "@neobuni/core";
import {
  activateStudyPlan,
  appendEvent,
  createGoal,
  createStudyPlan,
  createStudySessions,
  getGoal,
  getLatestStudyPlan,
  getStudyGoalConfig,
  getStudyPlan,
  getStudySession,
  listStudyChecks,
  listStudyMastery,
  listStudySessions,
  updateStudySession,
  upsertStudyGoalConfig,
} from "@neobuni/db";
import { ORPCError } from "@orpc/server";

const requireStudyGoal = async (profileId: string, goalId: string) => {
  const goal = await run(getGoal(goalId));
  if (!goal || goal.profileId !== profileId) {
    throw new ORPCError("NOT_FOUND", { message: "Goal not found" });
  }
  return goal;
};

const requireStudyConfig = async (goalId: string): Promise<StudyGoalConfig> => {
  const config = await run(getStudyGoalConfig(goalId));
  if (!config) {
    throw new ORPCError("PRECONDITION_FAILED", {
      message: "This goal has no study configuration",
    });
  }
  return config;
};

const requireActivePlan = async (goalId: string): Promise<StudyPlanView> => {
  const plan = await run(getLatestStudyPlan({ goalId, status: "active" }));
  if (!plan) {
    throw new ORPCError("PRECONDITION_FAILED", {
      message: "The study plan is not active yet",
    });
  }
  return plan;
};

const nowInTimezone = (config: StudyGoalConfig) => {
  const now = new Date();
  return {
    now,
    localDate: localDateInTimeZone(now, config.timezone),
    nowLocalDateTime: localDateTimeInTimeZone(now, config.timezone),
  };
};

const withNode = (
  session: StudySession,
  nodesById: Map<string, StudyPlanView["nodes"][number]>
): StudySessionWithNode | null => {
  const node = nodesById.get(session.planNodeId);
  return node ? { session, node } : null;
};

const computeProgress = async (input: {
  config: StudyGoalConfig;
  goalId: string;
  plan: StudyPlanView;
}) => {
  const [sessions, mastery, checks] = await Promise.all([
    run(listStudySessions(input.goalId)),
    run(listStudyMastery(input.goalId)),
    run(listStudyChecks(input.goalId)),
  ]);
  const nodeIds = new Set(input.plan.nodes.map((node) => node.id));
  const planSessions = sessions.filter((session) =>
    nodeIds.has(session.planNodeId)
  );
  const { now, nowLocalDateTime } = nowInTimezone(input.config);
  return computeStudyProgress({
    checks,
    goalId: input.goalId,
    mastery,
    nodes: input.plan.nodes,
    now: now.toISOString(),
    nowLocalDateTime,
    reviewRatio: input.config.planStyle.reviewRatio,
    sessions: planSessions,
    targetAt: input.config.targetAt,
  });
};

export const studyRouter = {
  goals: {
    create: protectedProcedure
      .input(studyGoalCreateSchema)
      .handler(async ({ input, context }) => {
        const goal = await run(
          createGoal({
            profileId: context.profileId,
            title: input.title,
            desiredOutcome: input.desiredOutcome,
            status: "active",
            horizon: "project",
            successCriteria: [
              {
                id: crypto.randomUUID(),
                description: `在 ${input.config.targetAt} 前通过考试`,
                satisfied: false,
              },
            ],
            constraints: [],
            autonomyMode: input.autonomyMode,
            planVersion: 0,
            nextReviewAt: null,
          })
        );

        const config = await run(
          upsertStudyGoalConfig({
            config: input.config,
            goalId: goal.id,
            profileId: context.profileId,
          })
        );

        await run(
          appendEvent(context.profileId, "study.goal_created", {
            goalId: goal.id,
            targetAt: config.targetAt,
            dailyMinutes: config.dailyMinutes,
            syllabusTemplateId: config.syllabusTemplateId,
          })
        );

        return { config, goal };
      }),
  },

  plans: {
    generate: protectedProcedure
      .input(studyPlanGenerateSchema)
      .handler(async ({ input, context }) => {
        await requireStudyGoal(context.profileId, input.goalId);
        const config = await requireStudyConfig(input.goalId);
        const template = getStudyTemplate(
          input.templateId ?? config.syllabusTemplateId
        );
        const latest = await run(getLatestStudyPlan({ goalId: input.goalId }));
        const version = (latest?.plan.version ?? 0) + 1;
        const planId = crypto.randomUUID();
        const { localDate } = nowInTimezone(config);
        const targetDate = config.targetAt.slice(0, 10);
        const availableMinutes =
          Math.max(
            1,
            countStudyDays({
              endDate: targetDate,
              restDays: config.restDays,
              startDate: localDate,
            })
          ) * config.dailyMinutes;

        const draft = buildStudyPlanDraft({
          availableMinutes,
          maxLessonMinutes: config.planStyle.maxLessonMinutes,
          planId,
          template,
        });

        const plan = await run(
          createStudyPlan({
            nodes: draft.nodes,
            plan: {
              diagnostics: draft.diagnostics,
              goalId: input.goalId,
              id: planId,
              profileId: context.profileId,
              status: "draft",
              templateId: template.id,
              version,
            },
          })
        );

        await run(
          appendEvent(context.profileId, "study.plan_generated", {
            goalId: input.goalId,
            planId,
            version,
            lessonCount: draft.lessonCount,
            totalMinutes: draft.totalMinutes,
            errorCount: draft.diagnostics.filter(
              (item) => item.severity === "error"
            ).length,
          })
        );

        return {
          lessonCount: draft.lessonCount,
          plan: plan.plan,
          nodes: plan.nodes,
          totalMinutes: draft.totalMinutes,
        };
      }),

    get: protectedProcedure
      .input(studyGoalParamSchema)
      .handler(async ({ input, context }) => {
        await requireStudyGoal(context.profileId, input.goalId);
        return run(getLatestStudyPlan({ goalId: input.goalId }));
      }),

    activate: protectedProcedure
      .input(studyPlanActivateSchema)
      .handler(async ({ input, context }) => {
        await requireStudyGoal(context.profileId, input.goalId);
        const config = await requireStudyConfig(input.goalId);
        const plan = await run(getStudyPlan(input.planId));
        if (!plan || plan.plan.goalId !== input.goalId) {
          throw new ORPCError("NOT_FOUND", { message: "Plan not found" });
        }
        if (plan.plan.status === "superseded") {
          throw new ORPCError("PRECONDITION_FAILED", {
            message: "A superseded plan cannot be activated",
          });
        }

        const nodeIds = new Set(plan.nodes.map((node) => node.id));
        const existing = (await run(listStudySessions(input.goalId))).filter(
          (session) => nodeIds.has(session.planNodeId)
        );
        if (existing.length > 0) {
          return { plan, sessions: existing };
        }

        const { localDate } = nowInTimezone(config);
        const targetDate = config.targetAt.slice(0, 10);
        const days = Math.max(1, diffLocalDays(localDate, targetDate));
        const scheduled = scheduleStudySessions({
          config,
          days,
          nodes: plan.nodes,
          startDate: localDate,
        });

        if (scheduled.unscheduledLessonIds.length > 0) {
          throw new ORPCError("BAD_REQUEST", {
            message:
              "The plan does not fit before the target date. Extend the deadline, add daily minutes, or reduce depth.",
            data: {
              unscheduledLessonIds: scheduled.unscheduledLessonIds,
              diagnostics: plan.plan.diagnostics,
            },
          });
        }

        const activated = await run(
          activateStudyPlan({ goalId: input.goalId, planId: input.planId })
        );
        const sessions = await run(
          createStudySessions(
            scheduled.sessions.map((session) => ({
              actualMinutes: null,
              completedAt: null,
              durationMinutes: session.durationMinutes,
              goalId: input.goalId,
              notes: null,
              planNodeId: session.planNodeId,
              profileId: context.profileId,
              rescheduledFrom: null,
              scheduledFor: session.scheduledFor,
              startedAt: null,
              status: "planned",
              timezone: session.timezone,
            }))
          )
        );

        await run(
          appendEvent(context.profileId, "study.plan_activated", {
            goalId: input.goalId,
            planId: input.planId,
            sessionCount: sessions.length,
          })
        );

        return { plan: activated ?? plan, sessions };
      }),
  },

  today: protectedProcedure
    .input(studyGoalParamSchema)
    .handler(async ({ input, context }): Promise<StudyToday> => {
      await requireStudyGoal(context.profileId, input.goalId);
      const config = await requireStudyConfig(input.goalId);
      const plan = await requireActivePlan(input.goalId);
      const nodesById = new Map(
        plan.nodes.map((node) => [node.id, node] as const)
      );
      const nodeIds = new Set(nodesById.keys());
      const sessions = (await run(listStudySessions(input.goalId)))
        .filter((session) => nodeIds.has(session.planNodeId))
        .sort((left, right) =>
          left.scheduledFor.localeCompare(right.scheduledFor)
        );
      const { localDate, nowLocalDateTime } = nowInTimezone(config);
      const next = selectNextStudySession({
        nowLocalDateTime,
        sessions,
      });
      const primary = next ? withNode(next, nodesById) : null;
      const upcoming = sessions
        .filter(
          (session) =>
            session.status === "planned" || session.status === "in_progress"
        )
        .slice(0, 14)
        .map((session) => withNode(session, nodesById))
        .filter((item): item is StudySessionWithNode => item !== null);

      return {
        goalId: input.goalId,
        localDate,
        primary,
        upcoming,
        progress: await computeProgress({
          config,
          goalId: input.goalId,
          plan,
        }),
      };
    }),

  progress: protectedProcedure
    .input(studyProgressInputSchema)
    .handler(async ({ input, context }) => {
      await requireStudyGoal(context.profileId, input.goalId);
      const config = await requireStudyConfig(input.goalId);
      const plan = await run(getLatestStudyPlan({ goalId: input.goalId }));
      if (!plan) {
        throw new ORPCError("NOT_FOUND", { message: "Plan not found" });
      }
      return computeProgress({ config, goalId: input.goalId, plan });
    }),

  sessions: {
    complete: protectedProcedure
      .input(studySessionCompleteSchema)
      .handler(async ({ input, context }) => {
        const session = await run(getStudySession(input.sessionId));
        if (!session || session.profileId !== context.profileId) {
          throw new ORPCError("NOT_FOUND", { message: "Session not found" });
        }
        const updated = await run(
          updateStudySession({
            sessionId: input.sessionId,
            patch: {
              actualMinutes: input.actualMinutes,
              completedAt: new Date().toISOString(),
              notes: input.notes ?? null,
              startedAt: session.startedAt ?? new Date().toISOString(),
              status: "completed",
            },
          })
        );
        if (!updated) {
          throw new ORPCError("NOT_FOUND", { message: "Session not found" });
        }
        return updated;
      }),

    skip: protectedProcedure
      .input(studySessionIdSchema)
      .handler(async ({ input, context }) => {
        const session = await run(getStudySession(input.sessionId));
        if (!session || session.profileId !== context.profileId) {
          throw new ORPCError("NOT_FOUND", { message: "Session not found" });
        }
        return run(
          updateStudySession({
            sessionId: input.sessionId,
            patch: { status: "skipped" },
          })
        );
      }),

    reschedule: protectedProcedure
      .input(studySessionRescheduleSchema)
      .handler(async ({ input, context }) => {
        const session = await run(getStudySession(input.sessionId));
        if (!session || session.profileId !== context.profileId) {
          throw new ORPCError("NOT_FOUND", { message: "Session not found" });
        }
        return run(
          updateStudySession({
            sessionId: input.sessionId,
            patch: {
              rescheduledFrom: session.scheduledFor,
              scheduledFor: input.scheduledFor,
              status: "planned",
            },
          })
        );
      }),
  },
};
