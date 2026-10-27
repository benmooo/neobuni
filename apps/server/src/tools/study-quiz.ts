import { studyQuizDef, studyQuizToolInputSchema } from "@neobuni/contracts";
import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

import { loadStudySnapshot } from "../study/snapshot";
import {
  resolveStudyQuizTarget,
  type StudyQuizSnapshot,
  toStudyQuizQuestions,
} from "./study-quiz-shared";
import type { ServerToolContext } from "./types";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));

type AppendEvent = typeof appendEvent;
type LoadStudySnapshot = (input: {
  now?: Date;
  profileId: string;
}) => Promise<StudyQuizSnapshot | null>;

interface StudyQuizDeps {
  appendEvent: AppendEvent;
  loadStudySnapshot: LoadStudySnapshot;
}

const defaultDeps: StudyQuizDeps = {
  appendEvent,
  loadStudySnapshot,
};

const createStudyQuizTool = (
  context: ServerToolContext,
  deps: StudyQuizDeps = defaultDeps
) =>
  studyQuizDef.server(async (args) => {
    studyQuizToolInputSchema.parse(args);
    const snapshot = await deps.loadStudySnapshot({
      now: new Date(context.referenceNow),
      profileId: context.profileId,
    });
    const { lesson, reason } = resolveStudyQuizTarget(snapshot);

    await deps.appendEvent(context.profileId, "tool.study_quiz", {
      available: lesson !== null,
      conversationId: context.conversationId,
      goalId: snapshot?.goal.id ?? null,
      reason,
      turnId: context.turnId,
    });

    if (!lesson) {
      return {
        available: false,
        goalId: snapshot?.goal.id ?? null,
        lessonTitle: null,
        objective: null,
        questions: [],
        reason,
      };
    }

    return {
      available: true,
      goalId: snapshot?.goal.id ?? null,
      lessonTitle: lesson.title,
      objective: lesson.enrichment?.objective ?? lesson.objective,
      questions: toStudyQuizQuestions(lesson),
      reason: null,
    };
  });

export type { StudyQuizDeps };
export { createStudyQuizTool };
