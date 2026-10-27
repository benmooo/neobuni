import { run } from "@neobuni/api";
import type { StudyCheckAnswer, StudyCheckResult } from "@neobuni/contracts";
import { studyCheckResultSchema } from "@neobuni/contracts";
import { localDateOf, updateStudyMastery } from "@neobuni/core";
import {
  appendEvent,
  createStudyCheck,
  createStudySessions,
  getLatestStudyPlan,
  getStudyGoalConfig,
  getStudySession,
  listStudyMastery,
  listStudySessions,
  updateStudySession,
  upsertStudyMastery,
} from "@neobuni/db";
import { ORPCError } from "@orpc/server";

import { gradeStudyChecks } from "./grading-service";

interface SubmitStudyCheckInput {
  answers: StudyCheckAnswer[];
  profileId: string;
  sessionId: string;
}

/**
 * Grade and persist a study check for one session.
 *
 * Shared by the HTTP router and the chat tools so a check submitted through
 * conversation has the same mastery, review, and session side effects.
 */
const submitStudyCheck = async (
  input: SubmitStudyCheckInput
): Promise<StudyCheckResult> => {
  const session = await run(getStudySession(input.sessionId));
  if (!session || session.profileId !== input.profileId) {
    throw new ORPCError("NOT_FOUND", { message: "Session not found" });
  }
  const config = await run(getStudyGoalConfig(session.goalId));
  if (!config) {
    throw new ORPCError("PRECONDITION_FAILED", {
      message: "This goal has no study configuration",
    });
  }
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
  const checkSpecs = node.enrichment?.checkSpecs ?? node.checkSpecs;
  if (checkSpecs.length === 0) {
    throw new ORPCError("PRECONDITION_FAILED", {
      message: "This lesson has no checks",
    });
  }

  const answers = new Map(
    input.answers.map((answer) => [answer.promptId, answer.answer])
  );
  const graded = await gradeStudyChecks({
    checks: checkSpecs.map((spec) => ({
      answer: answers.get(spec.id) ?? "",
      id: spec.id,
      prompt: spec.prompt,
      rubric: spec.rubric,
    })),
    lessonTitle: node.title,
    objective: node.objective ?? node.title,
    profileId: input.profileId,
  });

  const now = new Date().toISOString();
  const checkRows = await Promise.all(
    graded.grades.map((grade) => {
      const spec = checkSpecs.find((item) => item.id === grade.promptId);
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
          profileId: input.profileId,
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
  const passedCount = graded.grades.filter((grade) => grade.passed).length;
  const passed = passedCount >= 2;
  const existingMastery = (await run(listStudyMastery(session.goalId))).find(
    (item) => item.planNodeId === node.id
  );
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
            profileId: input.profileId,
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

  const feedback = graded.grades.map((grade) => grade.feedback).join("\n");
  await run(
    appendEvent(input.profileId, "study.check_submitted", {
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
};

export type { SubmitStudyCheckInput };
export { submitStudyCheck };
