import type {
  StudyCheck,
  StudyMastery,
  StudyPaper,
  StudyPaperReadiness,
  StudyPlanNode,
  StudyProgress,
  StudySession,
} from "@neobuni/contracts";

import { diffLocalDays, localDateOf } from "./date";
import { listStudyLessons, studyWeightTotal } from "./plan";

const PAPERS: StudyPaper[] = ["comprehensive", "case", "essay"];

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const weighted = (
  lessons: StudyPlanNode[],
  valueFor: (lesson: StudyPlanNode) => number
): number => {
  const total = lessons.reduce((sum, lesson) => sum + lesson.weight, 0);
  if (total <= 0) {
    return 0;
  }
  return (
    lessons.reduce((sum, lesson) => sum + lesson.weight * valueFor(lesson), 0) /
    total
  );
};

const latestMockScore = (
  paper: StudyPaper,
  lessons: StudyPlanNode[],
  checks: StudyCheck[]
): number | null => {
  const paperNodeIds = new Set(
    lessons
      .filter((lesson) => lesson.paper === paper || lesson.paper === "shared")
      .map((lesson) => lesson.id)
  );
  const mock = checks
    .filter(
      (check) =>
        check.kind === "mock" &&
        paperNodeIds.has(check.planNodeId) &&
        check.score !== null
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

  if (mock === undefined || mock.score === null) {
    return null;
  }
  return (mock.score / mock.maxScore) * 75;
};

const readiness = (
  mastery: number,
  coverage: number,
  mockScore: number | null
): number =>
  mockScore === null
    ? clamp01(0.7 * mastery + 0.3 * coverage)
    : clamp01(0.55 * mastery + 0.3 * (mockScore / 75) + 0.15 * coverage);

const addDays = (localDate: string, days: number): string => {
  const parsed = new Date(`${localDate}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const computeStreakDays = (input: {
  completedDates: string[];
  today: string;
}): number => {
  const dates = new Set(input.completedDates);
  let cursor = dates.has(input.today) ? input.today : addDays(input.today, -1);
  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
};

interface ComputeStudyProgressInput {
  checks: StudyCheck[];
  goalId: string;
  mastery: StudyMastery[];
  nodes: StudyPlanNode[];
  now: string;
  nowLocalDateTime: string;
  reviewRatio?: number;
  sessions: StudySession[];
  targetAt: string;
}

const computeStudyProgress = (
  input: ComputeStudyProgressInput
): StudyProgress => {
  const lessons = listStudyLessons(input.nodes);
  const masteryByNode = new Map(
    input.mastery.map((row) => [row.planNodeId, row])
  );
  const sessionsByNode = new Map(
    input.sessions
      .filter((session) => session.status === "completed")
      .map((session) => [session.planNodeId, session])
  );
  const today = localDateOf(input.nowLocalDateTime);
  const targetLocalDate = input.targetAt.slice(0, 10);
  const daysRemaining = Math.max(0, diffLocalDays(today, targetLocalDate));
  const totalWeight = studyWeightTotal(input.nodes);
  const completedLessons = lessons.filter(
    (lesson) =>
      sessionsByNode.has(lesson.id) ||
      (masteryByNode.get(lesson.id)?.score ?? 0) > 0
  );
  const completedWeight = completedLessons.reduce(
    (sum, lesson) => sum + lesson.weight,
    0
  );
  const coverage =
    totalWeight <= 0 ? 0 : clamp01(completedWeight / totalWeight);
  const masteryScore = weighted(
    lessons,
    (lesson) => masteryByNode.get(lesson.id)?.score ?? 0
  );
  const perPaper: StudyPaperReadiness[] = PAPERS.flatMap((paper) => {
    const paperLessons = lessons.filter(
      (lesson) => lesson.paper === paper || lesson.paper === "shared"
    );
    if (paperLessons.length === 0) {
      return [];
    }
    const paperCompletedWeight = paperLessons
      .filter(
        (lesson) =>
          sessionsByNode.has(lesson.id) ||
          (masteryByNode.get(lesson.id)?.score ?? 0) > 0
      )
      .reduce((sum, lesson) => sum + lesson.weight, 0);
    const paperTotalWeight = paperLessons.reduce(
      (sum, lesson) => sum + lesson.weight,
      0
    );
    const paperCoverage =
      paperTotalWeight <= 0
        ? 0
        : clamp01(paperCompletedWeight / paperTotalWeight);
    const paperMastery = weighted(
      paperLessons,
      (lesson) => masteryByNode.get(lesson.id)?.score ?? 0
    );
    const mockScore = latestMockScore(paper, lessons, input.checks);
    return [
      {
        paper,
        coverage: paperCoverage,
        mastery: paperMastery,
        mockScore,
        readiness: readiness(paperMastery, paperCoverage, mockScore),
      },
    ];
  });
  const normalizedPerPaper: StudyPaperReadiness[] =
    perPaper.length > 0
      ? perPaper
      : [
          {
            paper: "comprehensive",
            coverage: 0,
            mastery: 0,
            mockScore: null,
            readiness: 0,
          },
        ];
  const overallReadiness = Math.min(
    ...normalizedPerPaper.map((paper) => paper.readiness)
  );

  const countedSessions = input.sessions.filter(
    (session) => session.status !== "skipped"
  );
  const completedSessions = input.sessions.filter(
    (session) => session.status === "completed"
  );
  const dueSessions = input.sessions.filter(
    (session) =>
      session.status === "planned" && localDateOf(session.scheduledFor) <= today
  ).length;
  const missedSessions = input.sessions.filter(
    (session) => session.status === "missed"
  ).length;
  const adherenceBase = completedSessions.length + missedSessions + dueSessions;
  const adherenceRate =
    adherenceBase === 0
      ? null
      : clamp01(completedSessions.length / adherenceBase);
  const completedDates = completedSessions.map((session) =>
    localDateOf(session.scheduledFor)
  );
  const streakDays = computeStreakDays({ completedDates, today });
  const totalMinutes = completedSessions.reduce(
    (sum, session) => sum + (session.actualMinutes ?? session.durationMinutes),
    0
  );
  const remainingLessons = lessons.filter(
    (lesson) =>
      !sessionsByNode.has(lesson.id) &&
      (masteryByNode.get(lesson.id)?.score ?? 0) === 0
  );
  const remainingMinutes = remainingLessons.reduce(
    (sum, lesson) => sum + lesson.estimatedMinutes,
    0
  );
  const startedDates = input.sessions
    .map((session) => localDateOf(session.scheduledFor))
    .sort();
  const startedAt = startedDates[0] ?? today;
  const elapsedDays = Math.max(1, diffLocalDays(startedAt, today) + 1);
  const velocity = coverage / elapsedDays;
  const projectedCoverage = clamp01(coverage + velocity * daysRemaining);
  const reviewRatio = input.reviewRatio ?? 0.35;
  const minutesPerDayNeeded =
    daysRemaining === 0
      ? remainingMinutes
      : (remainingMinutes * (1 + reviewRatio)) / daysRemaining;

  return {
    goalId: input.goalId,
    generatedAt: input.now,
    targetAt: input.targetAt,
    daysRemaining,
    coverage,
    mastery: masteryScore,
    overallReadiness,
    sessionsCompleted: completedSessions.length,
    sessionsPlanned: countedSessions.length,
    dueSessions,
    adherenceRate,
    streakDays,
    totalMinutes,
    projectedCoverage,
    minutesPerDayNeeded,
    perPaper: normalizedPerPaper,
  };
};

export type { ComputeStudyProgressInput };
export { computeStreakDays, computeStudyProgress, latestMockScore, readiness };
