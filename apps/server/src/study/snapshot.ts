import type {
  Goal,
  StudyCheck,
  StudyGoalConfig,
  StudyMastery,
  StudyPlanNode,
  StudyPlanView,
  StudyProgress,
  StudySession,
} from "@neobuni/contracts";
import {
  computeStudyProgress,
  localDateInTimeZone,
  localDateTimeInTimeZone,
  selectNextStudySession,
} from "@neobuni/core";
import {
  getLatestStudyPlan,
  getStudyGoalConfig,
  listGoals,
  listStudyChecks,
  listStudyMastery,
  listStudySessions,
  runRepo,
} from "@neobuni/db";

interface StudySnapshot {
  checks: StudyCheck[];
  config: StudyGoalConfig;
  goal: Goal;
  localDate: string;
  mastery: StudyMastery[];
  node: StudyPlanNode | null;
  nowLocalDateTime: string;
  plan: StudyPlanView;
  progress: StudyProgress;
  session: StudySession | null;
  sessions: StudySession[];
}

const loadStudySnapshot = async (input: {
  now?: Date;
  profileId: string;
}): Promise<StudySnapshot | null> => {
  const goals = await runRepo(listGoals(input.profileId, "active"));
  for (const goal of goals) {
    const config = await runRepo(getStudyGoalConfig(goal.id));
    if (!config) {
      continue;
    }
    const plan = await runRepo(
      getLatestStudyPlan({ goalId: goal.id, status: "active" })
    );
    if (!plan) {
      continue;
    }
    const [allSessions, mastery, checks] = await Promise.all([
      runRepo(listStudySessions(goal.id)),
      runRepo(listStudyMastery(goal.id)),
      runRepo(listStudyChecks(goal.id)),
    ]);
    const nodeIds = new Set(plan.nodes.map((node) => node.id));
    const sessions = allSessions.filter((session) =>
      nodeIds.has(session.planNodeId)
    );
    const now = input.now ?? new Date();
    const nowLocalDateTime = localDateTimeInTimeZone(now, config.timezone);
    const progress = computeStudyProgress({
      checks,
      goalId: goal.id,
      mastery,
      nodes: plan.nodes,
      now: now.toISOString(),
      nowLocalDateTime,
      reviewRatio: config.planStyle.reviewRatio,
      sessions,
      targetAt: config.targetAt,
    });
    const session = selectNextStudySession({
      nowLocalDateTime,
      sessions,
    });
    const node = session
      ? (plan.nodes.find((item) => item.id === session.planNodeId) ?? null)
      : null;

    return {
      checks,
      config,
      goal,
      localDate: localDateInTimeZone(now, config.timezone),
      mastery,
      node,
      nowLocalDateTime,
      plan,
      progress,
      session,
      sessions,
    };
  }
  return null;
};

export type { StudySnapshot };
export { loadStudySnapshot };
