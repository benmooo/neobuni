import type {
  StudyMastery,
  StudyPlanNode,
  StudySession,
} from "@neobuni/contracts";
import { Alert, AlertDescription } from "@neobuni/ui/components/alert";
import { Badge } from "@neobuni/ui/components/badge";
import { Card } from "@neobuni/ui/components/card";
import { Progress } from "@neobuni/ui/components/progress";
import { Spinner } from "@neobuni/ui/components/spinner";
import { CaretRight } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { PageHeader } from "@/components/PageHeader";
import { masteryDotClass } from "@/features/study/charts/mastery-bands";
import { MasteryDistribution } from "@/features/study/charts/mastery-distribution";
import { RhythmChart } from "@/features/study/charts/rhythm-chart";
import { StudyChartCard } from "@/features/study/charts/study-chart-card";
import { StudyHeatmap } from "@/features/study/charts/study-heatmap";
import { WorkloadChart } from "@/features/study/charts/workload-chart";
import { EYEBROW, META, PROSE, TAG } from "@/features/study/lesson/styles";
import {
  useStudyActivity,
  useStudyGoalDetail,
  useStudyProgress,
} from "@/hooks/use-study";

export const Route = createFileRoute("/_app/study/$goalId")({
  component: StudyDetailPage,
});

const PAPER_LABELS = {
  comprehensive: "综合知识",
  case: "案例分析",
  essay: "论文",
  shared: "共享",
} as const;

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const lessonForTopic = (
  nodes: StudyPlanNode[],
  topicId: string
): StudyPlanNode[] =>
  nodes
    .filter((node) => node.kind === "lesson" && node.parentId === topicId)
    .sort((left, right) => left.order - right.order);

const topicsForModule = (
  nodes: StudyPlanNode[],
  moduleId: string
): StudyPlanNode[] =>
  nodes
    .filter((node) => node.kind === "topic" && node.parentId === moduleId)
    .sort((left, right) => left.order - right.order);

const moduleLessons = (
  nodes: StudyPlanNode[],
  moduleId: string
): StudyPlanNode[] =>
  topicsForModule(nodes, moduleId).flatMap((topic) =>
    lessonForTopic(nodes, topic.id)
  );

function SummaryCard({
  progress,
}: {
  progress: NonNullable<ReturnType<typeof useStudyProgress>["data"]>;
}) {
  const score = Math.round(progress.overallReadiness * 75);
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-start justify-between gap-2 px-4 pt-4">
        <div className="space-y-1">
          <span className={EYEBROW}>考前就绪度 · 三科最低值</span>
          <p className="font-heading text-4xl tabular-nums leading-none">
            {score}
            <span className="ml-1 font-sans text-muted-foreground text-sm">
              / 75
            </span>
          </p>
        </div>
        <Badge variant={score >= 45 ? "default" : "secondary"}>
          {score >= 45 ? "接近及格" : "仍需推进"}
        </Badge>
      </div>
      <div className="space-y-2.5 px-4 py-4">
        {progress.perPaper.map((paper) => (
          <div className="space-y-1" key={paper.paper}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span>{PAPER_LABELS[paper.paper]}</span>
              <span className={META}>
                {Math.round(paper.readiness * 75)} / 75
              </span>
            </div>
            <Progress value={paper.readiness * 100} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 divide-x divide-y border-t sm:grid-cols-4 sm:divide-y-0">
        {[
          { label: "覆盖率", value: `${Math.round(progress.coverage * 100)}%` },
          { label: "掌握度", value: `${Math.round(progress.mastery * 100)}%` },
          { label: "连续学习", value: `${progress.streakDays} 天` },
          { label: "距考试", value: `${progress.daysRemaining} 天` },
        ].map((stat) => (
          <div className="px-3 py-2" key={stat.label}>
            <p className={EYEBROW}>{stat.label}</p>
            <p className="mt-0.5 font-heading text-sm tabular-nums">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
      <p className="border-t px-4 py-3 text-muted-foreground text-xs leading-relaxed">
        按当前速度预计覆盖 {Math.round(progress.projectedCoverage * 100)}
        %；每天约需 {Math.round(progress.minutesPerDayNeeded)} 分钟。
      </p>
    </Card>
  );
}

function PlanTree({
  goalId,
  nodes,
  masteryByNode,
  completed,
}: {
  goalId: string;
  nodes: StudyPlanNode[];
  masteryByNode: Map<string, StudyMastery>;
  completed: Set<string>;
}) {
  const modules = nodes
    .filter((node) => node.kind === "module")
    .sort((left, right) => left.order - right.order);

  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className={EYEBROW}>完整计划</span>
        <span className={META}>{modules.length} 个模块</span>
      </div>
      <div className="divide-y">
        {modules.map((module) => {
          const lessons = moduleLessons(nodes, module.id);
          const done = lessons.filter((lesson) => completed.has(lesson.id));
          const masteryScores = lessons
            .map((lesson) => masteryByNode.get(lesson.id)?.score)
            .filter((value): value is number => value !== undefined);
          const averageMastery =
            masteryScores.length === 0
              ? 0
              : masteryScores.reduce((sum, value) => sum + value, 0) /
                masteryScores.length;
          return (
            <details className="group" key={module.id} open={done.length > 0}>
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
                <CaretRight className="size-3 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                <span className="min-w-0 flex-1 truncate font-heading text-sm">
                  {module.title}
                </span>
                <span className={TAG}>{PAPER_LABELS[module.paper]}</span>
                <span className={`${META} w-24 text-right`}>
                  {done.length}/{lessons.length} ·{" "}
                  {Math.round(averageMastery * 100)}%
                </span>
              </summary>
              <div className="space-y-4 border-t bg-muted/30 px-4 py-3">
                {topicsForModule(nodes, module.id).map((topic) => (
                  <div className="space-y-1" key={topic.id}>
                    <p className={`${EYEBROW} px-1`}>{topic.title}</p>
                    <div className="divide-y divide-border/60">
                      {lessonForTopic(nodes, topic.id).map((lesson) => {
                        const mastery = masteryByNode.get(lesson.id);
                        return (
                          <Link
                            className="group/lesson flex items-center gap-2 px-1 py-1.5 text-sm hover:text-primary"
                            key={lesson.id}
                            params={{ goalId, planNodeId: lesson.id }}
                            to="/study/$goalId/lesson/$planNodeId"
                          >
                            <span
                              className={`size-1.5 shrink-0 rounded-full ${masteryDotClass(mastery, completed.has(lesson.id))}`}
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {lesson.title}
                            </span>
                            {lesson.enrichment ? (
                              <span className={TAG}>AI</span>
                            ) : null}
                            <span className="shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums">
                              {lesson.estimatedMinutes}m
                              {mastery
                                ? ` · ${Math.round(mastery.score * 100)}%`
                                : ""}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </Card>
  );
}

function RecentSessions({ sessions }: { sessions: StudySession[] }) {
  const recent = [...sessions]
    .sort((left, right) => right.scheduledFor.localeCompare(left.scheduledFor))
    .slice(0, 12);
  if (recent.length === 0) {
    return null;
  }
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className={EYEBROW}>最近学习</span>
        <span className={META}>{recent.length} 次</span>
      </div>
      <div className="divide-y">
        {recent.map((session) => (
          <div
            className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
            key={session.id}
          >
            <span className={`${META} text-xs`}>
              {session.scheduledFor.slice(0, 16).replace("T", " ")}
            </span>
            <span
              className={
                session.status === "completed"
                  ? `${TAG} border-primary/40 text-primary`
                  : TAG
              }
            >
              {session.status}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StudyDetailPage() {
  const { goalId } = Route.useParams();
  const detail = useStudyGoalDetail(goalId);
  const progress = useStudyProgress(goalId);
  const activity = useStudyActivity(goalId, 91);

  if (detail.isLoading || progress.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (detail.isError || progress.isError) {
    return (
      <div className="flex h-screen flex-col">
        <PageHeader title="学习计划" />
        <div className="p-4">
          <Alert variant="destructive">
            <AlertDescription>
              学习计划读取失败：
              {messageOf(detail.error ?? progress.error)}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (!(detail.data && progress.data)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const { goal, plan, mastery, sessions, config } = detail.data;
  const nodes = plan?.nodes ?? [];
  const masteryByNode = new Map(mastery.map((item) => [item.planNodeId, item]));
  const completed = new Set(
    sessions
      .filter((session) => session.status === "completed")
      .map((session) => session.planNodeId)
  );
  const activityDays = activity.data?.days ?? [];
  const localDate = activity.data?.localDate ?? "";
  const pastDays = activityDays.filter((day) => day.date <= localDate);
  const recentDays = pastDays.slice(-14);
  const futureDays = activityDays
    .filter((day) => day.date > localDate)
    .slice(0, 14);
  const recentPlanned = recentDays.reduce(
    (sum, day) => sum + day.plannedMinutes,
    0
  );
  const recentDone = recentDays.reduce(
    (sum, day) => sum + day.completedMinutes,
    0
  );
  const overloadedDays = futureDays.filter(
    (day) => day.plannedMinutes > config.dailyMinutes
  ).length;

  return (
    <div className="flex h-screen flex-col">
      <PageHeader title={goal.title} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-3 px-4 pt-4 pb-24">
          <div className="space-y-2 border-b pb-4">
            <span className={`${EYEBROW} text-primary`}>学习旅程</span>
            <p className={PROSE}>{goal.desiredOutcome}</p>
            <p className={META}>
              模板 {plan?.plan.templateId ?? "—"} · 版本{" "}
              {plan?.plan.version ?? "—"} · {nodes.length} 个节点
            </p>
          </div>
          {progress.data ? <SummaryCard progress={progress.data} /> : null}
          {activity.data ? (
            <>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                <StudyChartCard
                  footer={`最近 14 天完成 ${Math.round(recentDone / 60)} 小时 / 计划 ${Math.round(recentPlanned / 60)} 小时`}
                  meta="计划 vs 完成"
                  title="近 14 天节奏"
                >
                  <RhythmChart days={recentDays} />
                </StudyChartCard>
                <StudyChartCard
                  meta={`${nodes.filter((node) => node.kind === "lesson").length} 节`}
                  title="掌握度分布"
                >
                  <MasteryDistribution
                    completed={completed}
                    masteryByNode={masteryByNode}
                    nodes={nodes}
                  />
                </StudyChartCard>
              </div>
              <StudyChartCard
                footer={
                  overloadedDays > 0
                    ? `有 ${overloadedDays} 天排课超过每日上限，考虑把课节往后挪。`
                    : "负荷均匀，按当前排期推进即可。"
                }
                meta={`每日上限 ${config.dailyMinutes} 分钟`}
                title="未来 14 天负荷"
              >
                <WorkloadChart
                  dailyMinutes={config.dailyMinutes}
                  days={futureDays}
                />
              </StudyChartCard>
              <StudyChartCard meta="近 12 周" title="学习热力图">
                <StudyHeatmap days={pastDays} />
              </StudyChartCard>
            </>
          ) : null}
          <PlanTree
            completed={completed}
            goalId={goalId}
            masteryByNode={masteryByNode}
            nodes={nodes}
          />
          <RecentSessions sessions={sessions} />
        </div>
      </div>
    </div>
  );
}
