import {
  studyProgressDef,
  studyProgressToolInputSchema,
} from "@neobuni/contracts";
import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

import { loadStudySnapshot } from "../study/snapshot";
import type { ServerToolContext } from "./types";

const createStudyProgressTool = (context: ServerToolContext) =>
  studyProgressDef.server(async (args) => {
    studyProgressToolInputSchema.parse(args);
    const snapshot = await loadStudySnapshot({
      now: new Date(context.referenceNow),
      profileId: context.profileId,
    });

    await runRepo(
      appendEventFx(context.profileId, "tool.study_progress", {
        conversationId: context.conversationId,
        turnId: context.turnId,
        hasGoal: snapshot !== null,
      })
    );

    if (!snapshot) {
      return {
        coverage: null,
        daysRemaining: null,
        goalId: null,
        goalTitle: null,
        mastery: null,
        minutesPerDayNeeded: null,
        overallReadiness: null,
        perPaper: [],
        projectedCoverage: null,
        weakestPaper: null,
      };
    }

    const weakest = [...snapshot.progress.perPaper].sort(
      (left, right) => left.readiness - right.readiness
    )[0];

    return {
      coverage: snapshot.progress.coverage,
      daysRemaining: snapshot.progress.daysRemaining,
      goalId: snapshot.goal.id,
      goalTitle: snapshot.goal.title,
      mastery: snapshot.progress.mastery,
      minutesPerDayNeeded: snapshot.progress.minutesPerDayNeeded,
      overallReadiness: snapshot.progress.overallReadiness,
      perPaper: snapshot.progress.perPaper.map((paper) => ({
        coverage: paper.coverage,
        mastery: paper.mastery,
        paper: paper.paper,
        readiness: paper.readiness,
      })),
      projectedCoverage: snapshot.progress.projectedCoverage,
      weakestPaper: weakest?.paper ?? null,
    };
  });

export { createStudyProgressTool };
