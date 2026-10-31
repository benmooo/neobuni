import type { StudyGoalCreate, StudyPaper } from "@neobuni/contracts";
import { Alert, AlertDescription } from "@neobuni/ui/components/alert";
import { Badge } from "@neobuni/ui/components/badge";
import { Button } from "@neobuni/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@neobuni/ui/components/card";
import { Input } from "@neobuni/ui/components/input";
import { Progress } from "@neobuni/ui/components/progress";
import { Spinner } from "@neobuni/ui/components/spinner";
import { CheckCircle, Clock, Fire, Target } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import {
  useSkipStudySession,
  useStartStudyGoal,
  useStudyGoals,
  useStudyToday,
} from "@/hooks/use-study";
import { EYEBROW, META } from "./lesson/styles";
import { TodayLessonCard } from "./lesson/today-lesson-card";

const PAPER_LABELS: Record<StudyPaper, string> = {
  comprehensive: "综合知识",
  case: "案例分析",
  essay: "论文",
  shared: "共享",
};

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const formatShortDate = (localDateTime: string) =>
  localDateTime.slice(5, 16).replace("T", " ");

function StartStudyGoalCard() {
  const start = useStartStudyGoal();
  const [title, setTitle] = useState("软考 · 系统架构设计师");
  const [targetDate, setTargetDate] = useState("2027-05-23");
  const [dailyMinutes, setDailyMinutes] = useState(90);
  const [windowStart, setWindowStart] = useState("20:00");
  const [windowEnd, setWindowEnd] = useState("22:30");
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    setFormError(null);
    if (!(title.trim() && targetDate)) {
      setFormError("请填写目标名称和考试日期。");
      return;
    }
    const input: StudyGoalCreate = {
      autonomyMode: "collaborate",
      config: {
        channels: [],
        dailyMinutes,
        planStyle: {
          maxLessonMinutes: 45,
          minLessonMinutes: 20,
          reviewRatio: 0.35,
        },
        quietHours: null,
        restDays: [0],
        studyWindow: { end: windowEnd, start: windowStart },
        syllabusTemplateId: "system-architect-2026",
        targetAt: new Date(`${targetDate}T00:00:00.000Z`).toISOString(),
        timezone: "Asia/Shanghai",
      },
      desiredOutcome:
        "通过系统架构设计师的三个科目：综合知识、案例分析、论文。",
      title: title.trim(),
    };

    try {
      await start.mutateAsync(input);
    } catch (error) {
      setFormError(messageOf(error));
    }
  };

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="gap-1.5 py-4">
        <span className={`${EYEBROW} text-primary`}>
          蓄力中 · 还没有学习目标
        </span>
        <CardTitle className="flex items-center gap-2 font-heading text-lg">
          <Target className="size-4 text-primary" />
          开始一个学习目标
        </CardTitle>
        <p className="text-muted-foreground text-sm leading-6">
          默认按 2027 年 5 月考试、每天 90 分钟生成计划。计划会拆成 30–45
          分钟的小课，并覆盖三个科目。
        </p>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        <label className="flex flex-col gap-1">
          <span className="text-[0.6875rem] text-muted-foreground">
            目标名称
          </span>
          <Input
            disabled={start.isPending}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="目标名称"
            value={title}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[0.6875rem] text-muted-foreground">
              考试日期
            </span>
            <Input
              disabled={start.isPending}
              onChange={(event) => setTargetDate(event.target.value)}
              type="date"
              value={targetDate}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[0.6875rem] text-muted-foreground">
              每天学习分钟
            </span>
            <Input
              disabled={start.isPending}
              min={15}
              onChange={(event) => setDailyMinutes(Number(event.target.value))}
              type="number"
              value={dailyMinutes}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[0.6875rem] text-muted-foreground">
              学习开始
            </span>
            <Input
              disabled={start.isPending}
              onChange={(event) => setWindowStart(event.target.value)}
              type="time"
              value={windowStart}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[0.6875rem] text-muted-foreground">
              学习结束
            </span>
            <Input
              disabled={start.isPending}
              onChange={(event) => setWindowEnd(event.target.value)}
              type="time"
              value={windowEnd}
            />
          </label>
        </div>
        {formError ? (
          <p className="text-destructive text-sm">{formError}</p>
        ) : null}
        <Button
          className="w-full"
          disabled={start.isPending}
          onClick={() => void submit()}
          size="lg"
        >
          {start.isPending ? (
            <>
              <Spinner className="size-4" />
              正在生成计划…
            </>
          ) : (
            "生成计划并开始"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function ProgressPanel({
  progress,
}: {
  progress: NonNullable<ReturnType<typeof useStudyToday>["data"]>["progress"];
}) {
  const score = Math.round(progress.overallReadiness * 75);
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-start justify-between gap-2 px-4 pt-4">
        <div className="space-y-1">
          <span className={EYEBROW}>考前就绪度</span>
          <p className="font-heading text-3xl tabular-nums leading-none">
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
        {progress.perPaper.map((paper) => {
          const paperScore = Math.round(paper.readiness * 75);
          return (
            <div className="space-y-1" key={paper.paper}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span>{PAPER_LABELS[paper.paper]}</span>
                <span className={`${META} text-[0.6875rem]`}>
                  {paperScore} / 75
                </span>
              </div>
              <Progress value={paper.readiness * 100} />
            </div>
          );
        })}
        <p className="text-muted-foreground text-xs">
          总体就绪度取三科最低值，45 分及格
        </p>
      </div>

      <div className="grid grid-cols-3 divide-x border-t">
        {[
          { label: "覆盖", value: `${Math.round(progress.coverage * 100)}%` },
          {
            icon: true,
            label: "连续",
            value: `${progress.streakDays} 天`,
          },
          { label: "距考试", value: `${progress.daysRemaining} 天` },
        ].map((stat) => (
          <div className="px-3 py-2" key={stat.label}>
            <p className={EYEBROW}>{stat.label}</p>
            <p className="mt-0.5 flex items-center gap-1 font-heading text-sm tabular-nums">
              {stat.icon ? <Fire className="size-3 text-primary" /> : null}
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <p className="border-t px-4 py-3 text-muted-foreground text-xs leading-relaxed">
        按当前速度，考试日预计覆盖{" "}
        {Math.round(progress.projectedCoverage * 100)}%；每天约需{" "}
        {Math.round(progress.minutesPerDayNeeded)} 分钟。
      </p>
    </Card>
  );
}

function StudyDashboard({ goalId }: { goalId: string }) {
  const today = useStudyToday(goalId);
  const skip = useSkipStudySession();

  if (today.isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (today.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          学习计划读取失败：{messageOf(today.error)}
        </AlertDescription>
      </Alert>
    );
  }

  const primary = today.data?.primary ?? null;
  const progress = today.data?.progress ?? null;
  const upcoming = today.data?.upcoming ?? [];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-3">
          {primary ? (
            <TodayLessonCard
              goalId={goalId}
              node={primary.node}
              onSkip={() => skip.mutate(primary.session.id)}
              session={primary.session}
            />
          ) : (
            <Card className="gap-0 py-0">
              <CardHeader className="gap-1.5 py-4">
                <span className={EYEBROW}>今天的课</span>
                <CardTitle className="flex items-center gap-2 font-heading text-lg">
                  <CheckCircle className="size-4 text-primary" />
                  今天没有安排
                </CardTitle>
                <p className="text-muted-foreground text-sm leading-6">
                  可以休息，或从下面的安排里提前学一节。
                </p>
              </CardHeader>
            </Card>
          )}
          <Link
            className="inline-flex items-center gap-1 px-1 font-medium text-muted-foreground text-xs hover:text-foreground"
            params={{ goalId }}
            to="/study/$goalId"
          >
            完整计划、热力图与检查点
          </Link>
        </div>
        {progress ? <ProgressPanel progress={progress} /> : null}
      </div>

      {upcoming.length > 0 ? (
        <Card className="gap-0 py-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className={`${EYEBROW} flex items-center gap-1.5`}>
              <Clock className="size-3" />
              接下来
            </span>
            <span className={META}>{upcoming.length} 节</span>
          </div>
          <div className="divide-y">
            {upcoming.slice(0, 7).map((item) => (
              <Link
                className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/60"
                key={item.session.id}
                params={{ goalId, planNodeId: item.node.id }}
                to="/study/$goalId/lesson/$planNodeId"
              >
                <span className={`${META} w-12 shrink-0`}>
                  {formatShortDate(item.session.scheduledFor)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm group-hover:text-foreground">
                  {item.node.title}
                </span>
                <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                  {item.session.durationMinutes}m
                </span>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function StudyCockpit() {
  const goals = useStudyGoals();
  const studyGoal = goals.data?.[0] ?? null;

  if (goals.isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!studyGoal) {
    return <StartStudyGoalCard />;
  }

  return <StudyDashboard goalId={studyGoal.goal.id} />;
}

export { StudyCockpit };
