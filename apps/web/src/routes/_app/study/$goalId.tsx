import type {
  StudyMastery,
  StudyPlanNode,
  StudySession,
} from "@neobuni/contracts";
import { Alert, AlertDescription } from "@neobuni/ui/components/alert";
import { Badge } from "@neobuni/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@neobuni/ui/components/card";
import { Progress } from "@neobuni/ui/components/progress";
import { Spinner } from "@neobuni/ui/components/spinner";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/PageHeader";
import { useStudyGoalDetail, useStudyProgress } from "@/hooks/use-study";

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

const masteryClass = (
  mastery: StudyMastery | undefined,
  completed: boolean
): string => {
  if (mastery && mastery.score >= 0.8) {
    return "bg-emerald-500";
  }
  if (mastery && mastery.score >= 0.6) {
    return "bg-amber-500";
  }
  if (mastery && mastery.score > 0) {
    return "bg-red-500";
  }
  return completed ? "bg-sky-500" : "bg-muted-foreground/25";
};

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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">旅程概览</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="font-semibold text-3xl">
              {score}
              <span className="ml-1 text-muted-foreground text-sm">/ 75</span>
            </p>
            <p className="text-muted-foreground text-xs">
              总体就绪度 = 三科最低值
            </p>
          </div>
          <Badge variant={score >= 45 ? "default" : "secondary"}>
            {score >= 45 ? "接近及格" : "仍需推进"}
          </Badge>
        </div>
        <div className="space-y-3">
          {progress.perPaper.map((paper) => (
            <div className="space-y-1" key={paper.paper}>
              <div className="flex items-center justify-between text-sm">
                <span>{PAPER_LABELS[paper.paper]}</span>
                <span className="text-muted-foreground">
                  {Math.round(paper.readiness * 75)} / 75
                </span>
              </div>
              <Progress value={paper.readiness * 100} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-muted-foreground text-xs">覆盖率</p>
            <p className="font-medium">
              {Math.round(progress.coverage * 100)}%
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">掌握度</p>
            <p className="font-medium">{Math.round(progress.mastery * 100)}%</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">连续学习</p>
            <p className="font-medium">{progress.streakDays} 天</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">距考试</p>
            <p className="font-medium">{progress.daysRemaining} 天</p>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          按当前速度预计覆盖 {Math.round(progress.projectedCoverage * 100)}
          %；每天约需 {Math.round(progress.minutesPerDayNeeded)} 分钟。
        </p>
      </CardContent>
    </Card>
  );
}

function MasteryHeatmap({
  nodes,
  masteryByNode,
  completed,
}: {
  nodes: StudyPlanNode[];
  masteryByNode: Map<string, StudyMastery>;
  completed: Set<string>;
}) {
  const lessons = nodes
    .filter((node) => node.kind === "lesson")
    .sort((left, right) => left.order - right.order);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">掌握度热力图</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {lessons.map((lesson) => {
            const mastery = masteryByNode.get(lesson.id);
            return (
              <span
                className={`h-3 w-3 rounded-sm ${masteryClass(mastery, completed.has(lesson.id))}`}
                key={lesson.id}
                title={`${lesson.title} · ${mastery ? Math.round(mastery.score * 100) : 0}%`}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/25" />
            未学
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-sky-500" />
            已学
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />
            &lt;60%
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
            60–80%
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
            ≥80%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function PlanTree({
  nodes,
  masteryByNode,
  completed,
}: {
  nodes: StudyPlanNode[];
  masteryByNode: Map<string, StudyMastery>;
  completed: Set<string>;
}) {
  const modules = nodes
    .filter((node) => node.kind === "module")
    .sort((left, right) => left.order - right.order);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">完整计划</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
            <details
              className="rounded-xl border p-3"
              key={module.id}
              open={done.length > 0}
            >
              <summary className="flex cursor-pointer items-center justify-between gap-2">
                <span className="font-medium text-sm">{module.title}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {PAPER_LABELS[module.paper]}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {done.length}/{lessons.length} · 掌握{" "}
                    {Math.round(averageMastery * 100)}%
                  </span>
                </span>
              </summary>
              <div className="mt-3 space-y-3">
                {topicsForModule(nodes, module.id).map((topic) => (
                  <div className="space-y-1" key={topic.id}>
                    <p className="font-medium text-sm">{topic.title}</p>
                    <div className="space-y-1">
                      {lessonForTopic(nodes, topic.id).map((lesson) => {
                        const mastery = masteryByNode.get(lesson.id);
                        return (
                          <div
                            className="flex items-center gap-2 text-sm"
                            key={lesson.id}
                          >
                            <span
                              className={`h-2.5 w-2.5 shrink-0 rounded-full ${masteryClass(mastery, completed.has(lesson.id))}`}
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {lesson.title}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {lesson.estimatedMinutes} 分钟
                              {mastery
                                ? ` · ${Math.round(mastery.score * 100)}%`
                                : ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </CardContent>
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">最近学习</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {recent.map((session) => (
          <div
            className="flex items-center justify-between gap-2 text-sm"
            key={session.id}
          >
            <span className="truncate">
              {session.scheduledFor.slice(0, 16).replace("T", " ")}
            </span>
            <Badge
              variant={session.status === "completed" ? "default" : "outline"}
            >
              {session.status}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function StudyDetailPage() {
  const { goalId } = Route.useParams();
  const detail = useStudyGoalDetail(goalId);
  const progress = useStudyProgress(goalId);

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

  const { goal, plan, mastery, sessions } = detail.data;
  const nodes = plan?.nodes ?? [];
  const masteryByNode = new Map(mastery.map((item) => [item.planNodeId, item]));
  const completed = new Set(
    sessions
      .filter((session) => session.status === "completed")
      .map((session) => session.planNodeId)
  );

  return (
    <div className="flex h-screen flex-col">
      <PageHeader title={goal.title} />
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <div className="mt-4 space-y-3">
          <Card size="sm">
            <CardContent className="space-y-1 py-3">
              <p className="text-muted-foreground text-sm">
                {goal.desiredOutcome}
              </p>
              <p className="text-muted-foreground text-xs">
                模板 {plan?.plan.templateId ?? "—"} · 版本{" "}
                {plan?.plan.version ?? "—"} · {nodes.length} 个节点
              </p>
            </CardContent>
          </Card>
          {progress.data ? <SummaryCard progress={progress.data} /> : null}
          <MasteryHeatmap
            completed={completed}
            masteryByNode={masteryByNode}
            nodes={nodes}
          />
          <PlanTree
            completed={completed}
            masteryByNode={masteryByNode}
            nodes={nodes}
          />
          <RecentSessions sessions={sessions} />
        </div>
      </div>
    </div>
  );
}
