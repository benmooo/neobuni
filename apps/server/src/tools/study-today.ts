import { studyTodayDef, studyTodayToolInputSchema } from "@neobuni/contracts";
import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

import { loadStudySnapshot } from "../study/snapshot";
import type { ServerToolContext } from "./types";

const createStudyTodayTool = (context: ServerToolContext) =>
  studyTodayDef.server(async (args) => {
    studyTodayToolInputSchema.parse(args);
    const snapshot = await loadStudySnapshot({
      now: new Date(context.referenceNow),
      profileId: context.profileId,
    });

    await runRepo(
      appendEventFx(context.profileId, "tool.study_today", {
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
        primary: null,
        readiness: null,
        streakDays: null,
      };
    }

    return {
      coverage: snapshot.progress.coverage,
      daysRemaining: snapshot.progress.daysRemaining,
      goalId: snapshot.goal.id,
      goalTitle: snapshot.goal.title,
      primary:
        snapshot.session && snapshot.node
          ? {
              how: snapshot.node.enrichment?.howText ?? snapshot.node.howText,
              minutes: snapshot.session.durationMinutes,
              scheduledFor: snapshot.session.scheduledFor,
              title: snapshot.node.title,
              what:
                snapshot.node.enrichment?.whatText ?? snapshot.node.whatText,
            }
          : null,
      readiness: snapshot.progress.overallReadiness,
      streakDays: snapshot.progress.streakDays,
    };
  });

export { createStudyTodayTool };
