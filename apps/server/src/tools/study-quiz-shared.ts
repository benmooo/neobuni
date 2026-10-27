import type { StudyPlanNode, StudySession } from "@neobuni/contracts";
import { localDateOf } from "@neobuni/core";

interface StudyQuizSnapshot {
  goal: { id: string };
  localDate: string;
  node: StudyPlanNode | null;
  plan: { nodes: StudyPlanNode[] };
  session: StudySession | null;
  sessions: StudySession[];
}

type StudyQuizTarget =
  | {
      lesson: StudyPlanNode;
      reason: null;
      session: StudySession;
    }
  | {
      lesson: null;
      reason: "no_active_goal" | "no_session_due" | "no_checks";
      session: null;
    };

const getStudyCheckSpecs = (node: StudyPlanNode) =>
  node.enrichment?.checkSpecs ?? node.checkSpecs;

const findLessonNode = (
  snapshot: StudyQuizSnapshot,
  session: StudySession
): StudyPlanNode | null => {
  const node =
    snapshot.session?.id === session.id
      ? snapshot.node
      : (snapshot.plan.nodes.find((item) => item.id === session.planNodeId) ??
        null);
  return node?.kind === "lesson" ? node : null;
};

const hasChecks = (node: StudyPlanNode) => getStudyCheckSpecs(node).length > 0;

/**
 * Resolve the lesson that can be quizzed right now.
 *
 * The actionable session wins, using the same rule as `study.today`: a
 * session scheduled for today or earlier. When nothing is actionable, fall
 * back to a lesson already completed today so "考考我" still works as an
 * on-demand re-test.
 */
const resolveStudyQuizTarget = (
  snapshot: StudyQuizSnapshot | null
): StudyQuizTarget => {
  if (!snapshot) {
    return { lesson: null, reason: "no_active_goal", session: null };
  }
  const { session } = snapshot;
  const dueToday =
    session !== null && localDateOf(session.scheduledFor) <= snapshot.localDate;
  const completedToday = snapshot.sessions
    .filter(
      (item) =>
        item.status === "completed" &&
        localDateOf(item.scheduledFor) === snapshot.localDate
    )
    .sort((left, right) => right.scheduledFor.localeCompare(left.scheduledFor));
  const candidates = dueToday ? [session, ...completedToday] : completedToday;

  let reason: "no_session_due" | "no_checks" = "no_session_due";
  for (const candidate of candidates) {
    const lesson = findLessonNode(snapshot, candidate);
    if (!lesson) {
      continue;
    }
    if (!hasChecks(lesson)) {
      reason = "no_checks";
      continue;
    }
    return { lesson, reason: null, session: candidate };
  }
  return { lesson: null, reason, session: null };
};

const toStudyQuizQuestions = (lesson: StudyPlanNode) =>
  getStudyCheckSpecs(lesson).map((spec) => ({
    id: spec.id,
    kind: spec.kind,
    prompt: spec.prompt,
  }));

export type { StudyQuizSnapshot };
export { getStudyCheckSpecs, resolveStudyQuizTarget, toStudyQuizQuestions };
