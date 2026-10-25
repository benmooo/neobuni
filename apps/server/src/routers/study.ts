import { protectedProcedure, run } from "@neobuni/api";
import {
  type StudyCheckResult,
  type StudyGoalConfig,
  type StudyGoalCreate,
  type StudyPlanView,
  type StudySession,
  type StudySessionWithNode,
  type StudyToday,
  studyCheckResultSchema,
  studyCheckSubmitSchema,
  studyGoalConfigUpdateSchema,
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
  localDateOf,
  localDateTimeInTimeZone,
  scheduleStudySessions,
  selectNextStudySession,
  updateStudyMastery,
} from "@neobuni/core";
import {
  activateStudyPlan,
  appendEvent,
  createGoal,
  createStudyCheck,
  createStudyPlan,
  createStudySessions,
  getGoal,
  getLatestStudyPlan,
  getStudyGoalConfig,
  getStudyPlan,
  getStudySession,
  listGoals,
  listStudyChecks,
  listStudyMastery,
  listStudySessions,
  updateStudySession,
  upsertStudyGoalConfig,
  upsertStudyMastery,
} from "@neobuni/db";
import { ORPCError } from "@orpc/server";

import { gradeStudyChecks } from "../study/grading-service";

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

const createStudyGoalRecord = async (input: {
  profileId: string;
  input: StudyGoalCreate;
}) => {
  const goal = await run(
    createGoal({
      profileId: input.profileId,
      title: input.input.title,
      desiredOutcome: input.input.desiredOutcome,
      status: "active",
      horizon: "project",
      successCriteria: [
        {
          id: crypto.randomUUID(),
          description: `在 ${input.input.config.targetAt} 前通过考试`,
          satisfied: false,
        },
      ],
      constraints: [],
      autonomyMode: input.input.autonomyMode,
      planVersion: 0,
      nextReviewAt: null,
    })
  );

  const config = await run(
    upsertStudyGoalConfig({
      config: input.input.config,
      goalId: goal.id,
      profileId: input.profileId,
    })
  );

  await run(
    appendEvent(input.profileId, "study.goal_created", {
      goalId: goal.id,
      targetAt: config.targetAt,
      dailyMinutes: config.dailyMinutes,
      syllabusTemplateId: config.syllabusTemplateId,
    })
  );

  return { config, goal };
};

const generatePlanForGoal = async (input: {
  goalId: string;
  profileId: string;
  templateId?: string | undefined;
}) => {
  await requireStudyGoal(input.profileId, input.goalId);
  const config = await requireStudyConfig(input.goalId);
  const template = getStudyTemplate(
    input.templateId ?? config.syllabusTemplateId
  );
  const latest = await run(getLatestStudyPlan({ goalId: input.goalId }));
  const previousMastery = await run(listStudyMastery(input.goalId));
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
        profileId: input.profileId,
        status: "draft",
        templateId: template.id,
        version,
      },
    })
  );

  if (latest) {
    const oldById = new Map(latest.nodes.map((node) => [node.id, node]));
    const newByStableId = new Map(
      draft.nodes.map((node) => [node.id.slice(planId.length + 1), node])
    );
    const copies = previousMastery.flatMap((item) => {
      const oldNode = oldById.get(item.planNodeId);
      if (oldNode?.kind !== "lesson") {
        return [];
      }
      const stableId = oldNode.id.slice(latest.plan.id.length + 1);
      const newNode = newByStableId.get(stableId);
      return newNode ? [{ ...item, planNodeId: newNode.id }] : [];
    });
    for (const copy of copies) {
      const { updatedAt: _updatedAt, ...mastery } = copy;
      await run(upsertStudyMastery(mastery));
    }
  }

  await run(
    appendEvent(input.profileId, "study.plan_generated", {
      goalId: input.goalId,
      planId,
      version,
      lessonCount: draft.lessonCount,
      totalMinutes: draft.totalMinutes,
      errorCount: draft.diagnostics.filter((item) => item.severity === "error")
        .length,
    })
  );

  return {
    lessonCount: draft.lessonCount,
    plan: plan.plan,
    nodes: plan.nodes,
    totalMinutes: draft.totalMinutes,
  };
};

const activatePlanForGoal = async (input: {
  goalId: string;
  planId: string;
  profileId: string;
}) => {
  await requireStudyGoal(input.profileId, input.goalId);
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
    return { nodes: plan.nodes, plan: plan.plan, sessions: existing };
  }

  const { localDate } = nowInTimezone(config);
  const targetDate = config.targetAt.slice(0, 10);
  const days = Math.max(1, diffLocalDays(localDate, targetDate));
  const studyDays = Math.max(
    1,
    countStudyDays({
      endDate: targetDate,
      restDays: config.restDays,
      startDate: localDate,
    })
  );
  const lessonCount = plan.nodes.filter(
    (node) => node.kind === "lesson"
  ).length;
  const scheduled = scheduleStudySessions({
    config,
    days,
    maxNewPerDay: Math.max(1, Math.ceil(lessonCount / studyDays)),
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
        profileId: input.profileId,
        rescheduledFrom: null,
        scheduledFor: session.scheduledFor,
        startedAt: null,
        status: "planned",
        timezone: session.timezone,
      }))
    )
  );

  await run(
    appendEvent(input.profileId, "study.plan_activated", {
      goalId: input.goalId,
      planId: input.planId,
      sessionCount: sessions.length,
    })
  );

  const activatedView = activated ?? plan;
  return {
    nodes: activatedView.nodes,
    plan: activatedView.plan,
    sessions,
  };
};

export const studyRouter = {
  goals: {
    list: protectedProcedure.handler(async ({ context }) => {
      const goals = (await run(listGoals(context.profileId))).filter(
        (goal) => goal.status === "active" || goal.status === "paused"
      );
      const rows = await Promise.all(
        goals.map(async (goal) => {
          const config = await run(getStudyGoalConfig(goal.id));
          return config ? { config, goal } : null;
        })
      );
      return rows.filter((row): row is NonNullable<typeof row> => row !== null);
    }),

    get: protectedProcedure
      .input(studyGoalParamSchema)
      .handler(async ({ input, context }) => {
        const goal = await requireStudyGoal(context.profileId, input.goalId);
        const config = await requireStudyConfig(input.goalId);
        const [plan, mastery, sessions] = await Promise.all([
          run(getLatestStudyPlan({ goalId: input.goalId })),
          run(listStudyMastery(input.goalId)),
          run(listStudySessions(input.goalId)),
        ]);
        return { config, goal, mastery, plan, sessions };
      }),

    create: protectedProcedure
      .input(studyGoalCreateSchema)
      .handler(({ input, context }) =>
        createStudyGoalRecord({ input, profileId: context.profileId })
      ),

    updateConfig: protectedProcedure
      .input(studyGoalConfigUpdateSchema)
      .handler(async ({ input, context }) => {
        const goal = await requireStudyGoal(context.profileId, input.goalId);
        const config = await run(
          upsertStudyGoalConfig({
            config: input.config,
            goalId: goal.id,
            profileId: context.profileId,
          })
        );
        await run(
          appendEvent(context.profileId, "study.config_updated", {
            goalId: goal.id,
            targetAt: config.targetAt,
            dailyMinutes: config.dailyMinutes,
            channels: config.channels.length,
          })
        );
        return config;
      }),

    start: protectedProcedure
      .input(studyGoalCreateSchema)
      .handler(async ({ input, context }) => {
        const created = await createStudyGoalRecord({
          input,
          profileId: context.profileId,
        });
        const generated = await generatePlanForGoal({
          goalId: created.goal.id,
          profileId: context.profileId,
        });
        const activated = await activatePlanForGoal({
          goalId: created.goal.id,
          planId: generated.plan.id,
          profileId: context.profileId,
        });
        return { ...created, ...generated, ...activated };
      }),
  },

  plans: {
    generate: protectedProcedure
      .input(studyPlanGenerateSchema)
      .handler(({ input, context }) =>
        generatePlanForGoal({
          goalId: input.goalId,
          profileId: context.profileId,
          templateId: input.templateId,
        })
      ),

    get: protectedProcedure
      .input(studyGoalParamSchema)
      .handler(async ({ input, context }) => {
        await requireStudyGoal(context.profileId, input.goalId);
        return run(getLatestStudyPlan({ goalId: input.goalId }));
      }),

    activate: protectedProcedure
      .input(studyPlanActivateSchema)
      .handler(({ input, context }) =>
        activatePlanForGoal({
          goalId: input.goalId,
          planId: input.planId,
          profileId: context.profileId,
        })
      ),
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

  checks: {
    submit: protectedProcedure
      .input(studyCheckSubmitSchema)
      .handler(async ({ input, context }): Promise<StudyCheckResult> => {
        const session = await run(getStudySession(input.sessionId));
        if (!session || session.profileId !== context.profileId) {
          throw new ORPCError("NOT_FOUND", { message: "Session not found" });
        }
        const config = await requireStudyConfig(session.goalId);
        const plan = await run(
          getLatestStudyPlan({ goalId: session.goalId, status: "active" })
        );
        if (!plan) {
          throw new ORPCError("PRECONDITION_FAILED", {
            message: "The study plan is not active yet",
          });
        }
        const node = plan.nodes.find((item) => item.id === session.planNodeId);
        if (!node) {
          throw new ORPCError("NOT_FOUND", { message: "Lesson not found" });
        }
        if (node.checkSpecs.length === 0) {
          throw new ORPCError("PRECONDITION_FAILED", {
            message: "This lesson has no checks",
          });
        }

        const answers = new Map(
          input.answers.map((answer) => [answer.promptId, answer.answer])
        );
        const graded = await gradeStudyChecks({
          checks: node.checkSpecs.map((spec) => ({
            answer: answers.get(spec.id) ?? "",
            id: spec.id,
            prompt: spec.prompt,
            rubric: spec.rubric,
          })),
          lessonTitle: node.title,
          objective: node.objective ?? node.title,
          profileId: context.profileId,
        });

        const now = new Date().toISOString();
        const checkRows = await Promise.all(
          graded.grades.map((grade) => {
            const spec = node.checkSpecs.find(
              (item) => item.id === grade.promptId
            );
            return run(
              createStudyCheck({
                answer: answers.get(grade.promptId) ?? "",
                feedback: grade.feedback,
                goalId: session.goalId,
                gradedBy: graded.gradedBy,
                kind: spec?.kind ?? "recall",
                maxScore: 1,
                passed: grade.passed,
                planNodeId: node.id,
                profileId: context.profileId,
                prompt: spec?.prompt ?? grade.promptId,
                rubric: spec?.rubric ?? null,
                score: grade.score,
                sessionId: session.id,
              })
            );
          })
        );

        const aggregate =
          graded.grades.reduce((sum, grade) => sum + grade.score, 0) /
          graded.grades.length;
        const passedCount = graded.grades.filter(
          (grade) => grade.passed
        ).length;
        const passed = passedCount >= 2;
        const existingMastery = (
          await run(listStudyMastery(session.goalId))
        ).find((item) => item.planNodeId === node.id);
        const masteryUpdate = updateStudyMastery({
          assessedAt: now,
          current: existingMastery
            ? {
                attempts: existingMastery.attempts,
                confidence: existingMastery.confidence,
                score: existingMastery.score,
              }
            : null,
          score: aggregate,
        });
        await run(
          upsertStudyMastery({
            goalId: session.goalId,
            planNodeId: node.id,
            ...masteryUpdate,
          })
        );

        if (masteryUpdate.nextReviewAt) {
          const reviewDate = masteryUpdate.nextReviewAt;
          const existingSessions = await run(listStudySessions(session.goalId));
          const alreadyScheduled = existingSessions.some(
            (item) =>
              item.planNodeId === node.id &&
              item.status === "planned" &&
              localDateOf(item.scheduledFor) === reviewDate
          );
          if (!alreadyScheduled) {
            await run(
              createStudySessions([
                {
                  actualMinutes: null,
                  completedAt: null,
                  durationMinutes: Math.min(20, node.estimatedMinutes),
                  goalId: session.goalId,
                  notes: passed ? "间隔复习" : "检查未通过，自动安排重学",
                  planNodeId: node.id,
                  profileId: context.profileId,
                  rescheduledFrom: null,
                  scheduledFor: `${reviewDate}T${config.studyWindow.start}`,
                  startedAt: null,
                  status: "planned",
                  timezone: config.timezone,
                },
              ])
            );
          }
        }

        if (session.status !== "completed") {
          await run(
            updateStudySession({
              sessionId: session.id,
              patch: {
                actualMinutes: session.durationMinutes,
                completedAt: now,
                startedAt: session.startedAt ?? now,
                status: "completed",
              },
            })
          );
        }

        const feedback = graded.grades
          .map((grade) => grade.feedback)
          .join("\n");
        await run(
          appendEvent(context.profileId, "study.check_submitted", {
            goalId: session.goalId,
            sessionId: session.id,
            planNodeId: node.id,
            score: aggregate,
            passed,
            gradedBy: graded.gradedBy,
          })
        );

        return studyCheckResultSchema.parse({
          checkIds: checkRows.map((row) => row.id),
          feedback,
          items: graded.grades.map((grade) => ({
            feedback: grade.feedback,
            missingPoints: grade.missingPoints,
            passed: grade.passed,
            promptId: grade.promptId,
            score: grade.score,
          })),
          mastery: masteryUpdate.score,
          maxScore: 1,
          needsReteach: !passed || masteryUpdate.needsReteach,
          nextReviewAt: masteryUpdate.nextReviewAt,
          passed,
          score: aggregate,
        });
      }),
  },

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
