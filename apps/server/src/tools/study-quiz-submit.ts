import type { StudyCheckResult } from "@neobuni/contracts";
import {
  studyQuizSubmitDef,
  studyQuizSubmitToolInputSchema,
} from "@neobuni/contracts";
import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

import {
  type SubmitStudyCheckInput,
  submitStudyCheck,
} from "../study/check-service";
import { loadStudySnapshot } from "../study/snapshot";
import {
  getStudyCheckSpecs,
  resolveStudyQuizTarget,
  type StudyQuizSnapshot,
} from "./study-quiz-shared";
import type { ServerToolContext } from "./types";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));

type AppendEvent = typeof appendEvent;
type LoadStudySnapshot = (input: {
  now?: Date;
  profileId: string;
}) => Promise<StudyQuizSnapshot | null>;
type SubmitStudyCheck = (
  input: SubmitStudyCheckInput
) => Promise<StudyCheckResult>;

interface StudyQuizSubmitDeps {
  appendEvent: AppendEvent;
  loadStudySnapshot: LoadStudySnapshot;
  submitStudyCheck: SubmitStudyCheck;
}

const defaultDeps: StudyQuizSubmitDeps = {
  appendEvent,
  loadStudySnapshot,
  submitStudyCheck,
};

const createStudyQuizSubmitTool = (
  context: ServerToolContext,
  deps: StudyQuizSubmitDeps = defaultDeps
) =>
  studyQuizSubmitDef.server(async (args) => {
    const input = studyQuizSubmitToolInputSchema.parse(args);
    const snapshot = await deps.loadStudySnapshot({
      now: new Date(context.referenceNow),
      profileId: context.profileId,
    });
    const { lesson, reason, session } = resolveStudyQuizTarget(snapshot);

    if (!(lesson && session)) {
      await deps.appendEvent(context.profileId, "tool.study_quiz_submit", {
        conversationId: context.conversationId,
        goalId: snapshot?.goal.id ?? null,
        reason,
        submitted: false,
        turnId: context.turnId,
      });
      return { reason, result: null, submitted: false };
    }

    const knownPromptIds = new Set(
      getStudyCheckSpecs(lesson).map((spec) => spec.id)
    );
    const hasUnknownPrompt = input.answers.some(
      (answer) => !knownPromptIds.has(answer.promptId)
    );
    if (hasUnknownPrompt) {
      await deps.appendEvent(context.profileId, "tool.study_quiz_submit", {
        conversationId: context.conversationId,
        goalId: snapshot?.goal.id ?? null,
        planNodeId: lesson.id,
        reason: "unknown_prompt",
        submitted: false,
        turnId: context.turnId,
      });
      return { reason: "unknown_prompt", result: null, submitted: false };
    }

    const result = await deps.submitStudyCheck({
      answers: input.answers,
      profileId: context.profileId,
      sessionId: session.id,
    });

    await deps.appendEvent(context.profileId, "tool.study_quiz_submit", {
      conversationId: context.conversationId,
      goalId: snapshot?.goal.id ?? null,
      needsReteach: result.needsReteach,
      passed: result.passed,
      planNodeId: lesson.id,
      reason: null,
      score: result.score,
      submitted: true,
      turnId: context.turnId,
    });

    return { reason: null, result, submitted: true };
  });

export type { StudyQuizSubmitDeps };
export { createStudyQuizSubmitTool };
