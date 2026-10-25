import type {
  StudyCheckResult,
  StudyCheckSpec,
  StudyGoalCreate,
  StudyPaper,
  StudyPlanNode,
  StudySession,
} from "@neobuni/contracts";
import { Alert, AlertDescription } from "@neobuni/ui/components/alert";
import { Badge } from "@neobuni/ui/components/badge";
import { Button } from "@neobuni/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@neobuni/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@neobuni/ui/components/dialog";
import { Input } from "@neobuni/ui/components/input";
import { Progress } from "@neobuni/ui/components/progress";
import { Spinner } from "@neobuni/ui/components/spinner";
import { Textarea } from "@neobuni/ui/components/textarea";
import { CheckCircle, Clock, Fire, Target } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import {
  useEnrichStudyLesson,
  useSkipStudySession,
  useStartStudyGoal,
  useStudyGoals,
  useStudyToday,
  useSubmitStudyChecks,
} from "@/hooks/use-study";

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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Target size={18} />
          开始一个学习目标
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          默认按 2027 年 5 月考试、每天 90 分钟生成计划。计划会拆成 30–45
          分钟的小课，并覆盖三个科目。
        </p>
        <Input
          aria-label="目标名称"
          disabled={start.isPending}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="目标名称"
          value={title}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            aria-label="考试日期"
            disabled={start.isPending}
            onChange={(event) => setTargetDate(event.target.value)}
            type="date"
            value={targetDate}
          />
          <Input
            aria-label="每天学习分钟"
            disabled={start.isPending}
            min={15}
            onChange={(event) => setDailyMinutes(Number(event.target.value))}
            type="number"
            value={dailyMinutes}
          />
          <Input
            aria-label="学习开始时间"
            disabled={start.isPending}
            onChange={(event) => setWindowStart(event.target.value)}
            type="time"
            value={windowStart}
          />
          <Input
            aria-label="学习结束时间"
            disabled={start.isPending}
            onChange={(event) => setWindowEnd(event.target.value)}
            type="time"
            value={windowEnd}
          />
        </div>
        {formError ? (
          <p className="text-destructive text-sm">{formError}</p>
        ) : null}
        <Button disabled={start.isPending} onClick={() => void submit()}>
          {start.isPending ? "正在生成计划…" : "生成计划并开始"}
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">学习进度</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="font-semibold text-2xl">
              {score}
              <span className="ml-1 text-muted-foreground text-sm">/ 75</span>
            </p>
            <p className="text-muted-foreground text-xs">
              总体就绪度取三科最低值，45 分及格
            </p>
          </div>
          <Badge variant={score >= 45 ? "default" : "secondary"}>
            {score >= 45 ? "接近及格" : "仍需推进"}
          </Badge>
        </div>
        <div className="space-y-3">
          {progress.perPaper.map((paper) => {
            const paperScore = Math.round(paper.readiness * 75);
            return (
              <div className="space-y-1" key={paper.paper}>
                <div className="flex items-center justify-between text-sm">
                  <span>{PAPER_LABELS[paper.paper]}</span>
                  <span className="text-muted-foreground">
                    {paperScore} / 75
                  </span>
                </div>
                <Progress value={paper.readiness * 100} />
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">覆盖</p>
            <p className="font-medium">
              {Math.round(progress.coverage * 100)}%
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">连续</p>
            <p className="flex items-center gap-1 font-medium">
              <Fire size={14} />
              {progress.streakDays} 天
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">距考试</p>
            <p className="font-medium">{progress.daysRemaining} 天</p>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          按当前速度，考试日预计覆盖{" "}
          {Math.round(progress.projectedCoverage * 100)}%；每天约需{" "}
          {Math.round(progress.minutesPerDayNeeded)} 分钟。
        </p>
      </CardContent>
    </Card>
  );
}

function SessionCard({
  goalId,
  node,
  session,
  onComplete,
  onSkip,
}: {
  goalId: string;
  node: StudyPlanNode;
  session: StudySession;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const enrich = useEnrichStudyLesson();
  const enrichment = node.enrichment;
  const whatText = enrichment?.whatText ?? node.whatText;
  const howText = enrichment?.howText ?? node.howText;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{node.title}</CardTitle>
          <div className="flex flex-col items-end gap-1">
            <Badge variant="secondary">
              {PAPER_LABELS[node.paper]} · {session.durationMinutes} 分钟
            </Badge>
            {enrichment ? <Badge variant="outline">AI 细化</Badge> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {whatText ? (
          <div>
            <p className="font-medium text-sm">学什么</p>
            <p className="whitespace-pre-line text-muted-foreground text-sm">
              {whatText}
            </p>
          </div>
        ) : null}
        {howText ? (
          <div>
            <p className="font-medium text-sm">怎么学</p>
            <p className="whitespace-pre-line text-muted-foreground text-sm">
              {howText}
            </p>
          </div>
        ) : null}
        {enrich.isError ? (
          <p className="text-destructive text-sm">
            细化失败：{messageOf(enrich.error)}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={onComplete}>完成并检查</Button>
          <Button onClick={onSkip} variant="secondary">
            今天跳过
          </Button>
          {enrichment ? null : (
            <Button
              disabled={enrich.isPending}
              onClick={() =>
                enrich.mutate({ force: false, goalId, planNodeId: node.id })
              }
              variant="ghost"
            >
              {enrich.isPending ? "细化中…" : "用 AI 细化这节课"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CheckDialog({
  form,
  onClose,
}: {
  form: {
    node: StudyPlanNode;
    session: StudySession;
    specs: StudyCheckSpec[];
  } | null;
  onClose: () => void;
}) {
  const submitChecks = useSubmitStudyChecks();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<StudyCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setAnswers({});
    setResult(null);
    setError(null);
    onClose();
  };

  const canSubmit =
    form?.specs.every((spec) => (answers[spec.id] ?? "").trim().length > 0) ??
    false;

  const submit = async () => {
    if (!form) {
      return;
    }
    setError(null);
    try {
      const graded = await submitChecks.mutateAsync({
        answers: form.specs.map((spec) => ({
          answer: (answers[spec.id] ?? "").trim(),
          promptId: spec.id,
        })),
        sessionId: form.session.id,
      });
      setResult(graded);
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      open={form !== null}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>检查：{form?.node.title}</DialogTitle>
          <DialogDescription>
            不看资料回答。3 题中至少 2
            题达标才算通过；未通过会自动安排次日重学。
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant={result.passed ? "default" : "destructive"}>
                {result.passed ? "通过" : "未通过"}
              </Badge>
              <span className="text-muted-foreground text-sm">
                综合得分 {Math.round(result.score * 100)} / 100 · 掌握度{" "}
                {Math.round(result.mastery * 100)}%
              </span>
            </div>
            {result.items.map((item) => (
              <div className="space-y-1" key={item.promptId}>
                <p className="font-medium text-sm">
                  {item.passed ? "达标" : "需重学"} ·{" "}
                  {Math.round(item.score * 100)}
                </p>
                <p className="text-muted-foreground text-sm">{item.feedback}</p>
                {item.missingPoints.length > 0 ? (
                  <p className="text-muted-foreground text-xs">
                    漏点：{item.missingPoints.join("、")}
                  </p>
                ) : null}
              </div>
            ))}
            {result.nextReviewAt ? (
              <p className="text-muted-foreground text-sm">
                下次复习：{result.nextReviewAt}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {form?.specs.map((spec, index) => (
              <div className="space-y-1" key={spec.id}>
                <p className="font-medium text-sm">
                  {index + 1}. {spec.prompt}
                </p>
                <Textarea
                  disabled={submitChecks.isPending}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [spec.id]: event.target.value,
                    }))
                  }
                  placeholder="用自己的话回答，尽量给出例子或取舍"
                  value={answers[spec.id] ?? ""}
                />
              </div>
            ))}
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={close}>关闭</Button>
          ) : (
            <>
              <Button onClick={close} variant="ghost">
                取消
              </Button>
              <Button
                disabled={!canSubmit || submitChecks.isPending}
                onClick={() => void submit()}
              >
                {submitChecks.isPending ? "判分中…" : "提交检查"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StudyDashboard({ goalId }: { goalId: string }) {
  const today = useStudyToday(goalId);
  const skip = useSkipStudySession();
  const [checkForm, setCheckForm] = useState<{
    node: StudyPlanNode;
    session: StudySession;
    specs: StudyCheckSpec[];
  } | null>(null);

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
      {primary ? (
        <SessionCard
          goalId={goalId}
          node={primary.node}
          onComplete={() => {
            setCheckForm({
              node: primary.node,
              session: primary.session,
              specs:
                primary.node.enrichment?.checkSpecs ?? primary.node.checkSpecs,
            });
          }}
          onSkip={() => skip.mutate(primary.session.id)}
          session={primary.session}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle size={18} />
              今天没有安排
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            可以休息，或从下面的未来安排里提前学一节。
          </CardContent>
        </Card>
      )}

      {progress ? <ProgressPanel progress={progress} /> : null}

      <Link params={{ goalId }} to="/study/$goalId">
        <Button className="w-full" variant="secondary">
          查看完整计划与热力图
        </Button>
      </Link>

      {upcoming.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock size={18} />
              未来安排
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.slice(0, 7).map((item) => (
              <div
                className="flex items-center justify-between gap-2"
                key={item.session.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{item.node.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatShortDate(item.session.scheduledFor)}
                  </p>
                </div>
                <Badge variant="secondary">
                  {item.session.durationMinutes} 分钟
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <CheckDialog form={checkForm} onClose={() => setCheckForm(null)} />
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
