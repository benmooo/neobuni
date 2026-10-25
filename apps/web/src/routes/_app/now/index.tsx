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
import { Spinner } from "@neobuni/ui/components/spinner";
import { Textarea } from "@neobuni/ui/components/textarea";
import { ArrowsClockwise, CheckCircle, Target } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StudyCockpit } from "@/features/study/study-cockpit";
import {
  useCompleteSuggestedCommitment,
  useCreateActiveGoal,
  useCreateCommitment,
  useDecisionFeedback,
  useEvaluateNextAction,
  useGoals,
  useNowOverview,
  useUpdateCommitmentStatus,
  useUpdateGoalStatus,
} from "@/hooks/use-goals";

export const Route = createFileRoute("/_app/now/")({ component: NowPage });

const failureMessage = (error: unknown) =>
  error instanceof Error ? error.message : "请稍后重试。";

const formatReviewAt = (value: string | null) => {
  if (!value) {
    return "按目标状态持续复查";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "检查时间待确认"
    : new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
};

function NowPage() {
  const overview = useNowOverview();
  const goals = useGoals();
  const evaluate = useEvaluateNextAction();
  const feedback = useDecisionFeedback();
  const completeCommitment = useCompleteSuggestedCommitment();
  const createGoal = useCreateActiveGoal();
  const createCommitment = useCreateCommitment();
  const updateGoalStatus = useUpdateGoalStatus();
  const updateCommitmentStatus = useUpdateCommitmentStatus();
  const [goalTitle, setGoalTitle] = useState("");
  const [goalOutcome, setGoalOutcome] = useState("");
  const [goalFormError, setGoalFormError] = useState<string | null>(null);
  const [commitmentGoalId, setCommitmentGoalId] = useState<string | null>(null);
  const [commitmentTitle, setCommitmentTitle] = useState("");
  const [commitmentFormError, setCommitmentFormError] = useState<string | null>(
    null
  );
  const evaluatedSuggestion = evaluate.data?.suggestedAction ?? null;
  const suggestedAction =
    evaluatedSuggestion ?? overview.data?.suggestedAction ?? null;
  const evaluatedDecisionId =
    evaluate.data?.decision.id ?? overview.data?.suggestedDecisionId ?? null;
  const suggestedCommitmentId = suggestedAction?.id.startsWith("commitment:")
    ? suggestedAction.id.slice("commitment:".length)
    : null;
  const suggestedCommitment = overview.data?.openCommitments.find(
    (commitment) => commitment.id === suggestedCommitmentId
  );
  const executableCommitment =
    suggestedCommitment?.status === "open" ||
    suggestedCommitment?.status === "blocked"
      ? suggestedCommitment
      : null;
  const pausedGoals = (goals.data ?? []).filter(
    (goal) => goal.status === "paused"
  );
  const submitGoal = () => {
    const title = goalTitle.trim();
    const desiredOutcome = goalOutcome.trim();
    if (!(title && desiredOutcome)) {
      setGoalFormError("请填写目标名称和预期结果。");
      return;
    }
    setGoalFormError(null);
    createGoal.mutate(
      { title, desiredOutcome },
      {
        onSuccess: () => {
          setGoalTitle("");
          setGoalOutcome("");
        },
      }
    );
  };
  const submitCommitment = () => {
    const title = commitmentTitle.trim();
    if (!(commitmentGoalId && title)) {
      setCommitmentFormError("请填写承诺内容。");
      return;
    }
    setCommitmentFormError(null);
    createCommitment.mutate(
      { goalId: commitmentGoalId, title },
      {
        onSuccess: () => {
          setCommitmentTitle("");
          setCommitmentGoalId(null);
        },
      }
    );
  };
  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        actions={
          <Button
            disabled={overview.isFetching}
            onClick={() => void overview.refetch()}
            size="icon"
            variant="ghost"
          >
            <ArrowsClockwise
              className={overview.isFetching ? "animate-spin" : undefined}
              size={20}
            />
          </Button>
        }
        title="Now"
      />
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="mt-4 flex flex-col gap-4">
          <StudyCockpit />
          {overview.isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner />
            </div>
          ) : overview.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                Now 读取失败：{failureMessage(overview.error)}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <section className="space-y-2">
                <p className="font-medium text-sm">主动跟进</p>
                <Card size="sm">
                  <CardContent className="space-y-1 py-3 text-muted-foreground text-sm">
                    <p>
                      下次检查：
                      {formatReviewAt(overview.data?.nextReviewAt ?? null)}
                    </p>
                    <p>
                      Buni
                      会围绕活跃目标生成可解释建议；执行仍需要你的明确授权。
                    </p>
                  </CardContent>
                </Card>
              </section>
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm">下一步建议</p>
                  <Button
                    disabled={evaluate.isPending}
                    onClick={() => evaluate.mutate({})}
                    size="sm"
                  >
                    {evaluate.isPending ? "评估中…" : "评估建议"}
                  </Button>
                </div>
                {evaluate.isError ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      建议评估失败：{failureMessage(evaluate.error)}
                    </AlertDescription>
                  </Alert>
                ) : null}
                {suggestedAction ? (
                  <Card>
                    <CardContent className="space-y-2 py-4">
                      <p className="font-medium text-sm">
                        {suggestedAction.title}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {suggestedAction.rationale}
                      </p>
                      <Badge variant="secondary">仅建议，未执行</Badge>
                      {evaluatedDecisionId ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={feedback.isPending}
                            onClick={() =>
                              feedback.mutate({
                                decisionId: evaluatedDecisionId,
                                kind: "accepted",
                                candidateId: suggestedAction.id,
                              })
                            }
                            size="sm"
                          >
                            接受
                          </Button>
                          {executableCommitment && evaluatedDecisionId ? (
                            <Button
                              disabled={completeCommitment.isPending}
                              onClick={() =>
                                completeCommitment.mutate({
                                  decisionId: evaluatedDecisionId,
                                  candidateId: suggestedAction.id,
                                  commitmentId: executableCommitment.id,
                                  expectedStatus: executableCommitment.status,
                                })
                              }
                              size="sm"
                            >
                              {completeCommitment.isPending
                                ? "执行中…"
                                : "完成此承诺"}
                            </Button>
                          ) : null}
                          <Button
                            disabled={feedback.isPending}
                            onClick={() =>
                              feedback.mutate({
                                decisionId: evaluatedDecisionId,
                                kind: "deferred",
                                candidateId: suggestedAction.id,
                              })
                            }
                            size="sm"
                            variant="secondary"
                          >
                            稍后处理
                          </Button>
                          <Button
                            disabled={feedback.isPending}
                            onClick={() =>
                              feedback.mutate({
                                decisionId: evaluatedDecisionId,
                                kind: "dismissed",
                                candidateId: suggestedAction.id,
                              })
                            }
                            size="sm"
                            variant="ghost"
                          >
                            忽略
                          </Button>
                        </div>
                      ) : null}
                      {feedback.isError ? (
                        <p className="text-destructive text-sm">
                          反馈未保存：{failureMessage(feedback.error)}
                        </p>
                      ) : null}
                      {completeCommitment.isError ? (
                        <p className="text-destructive text-sm">
                          操作未排入执行：
                          {failureMessage(completeCommitment.error)}
                        </p>
                      ) : null}
                      {completeCommitment.isSuccess ? (
                        <p className="text-muted-foreground text-sm">
                          已排入可审计执行队列。
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    当前没有可建议的下一步。
                  </p>
                )}
              </section>
              {pausedGoals.length ? (
                <section className="space-y-2">
                  <p className="font-medium text-sm">已暂停目标</p>
                  {pausedGoals.map((goal) => (
                    <Card key={goal.id} size="sm">
                      <CardContent className="flex items-center justify-between gap-2 py-3">
                        <span className="text-sm">{goal.title}</span>
                        <Button
                          disabled={updateGoalStatus.isPending}
                          onClick={() =>
                            updateGoalStatus.mutate({
                              goalId: goal.id,
                              status: "active",
                            })
                          }
                          size="sm"
                          variant="secondary"
                        >
                          恢复跟进
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </section>
              ) : null}
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm">活跃目标</p>
                  <Badge variant="secondary">围绕目标持续跟进</Badge>
                </div>
                {overview.data?.activeGoals.length ? (
                  overview.data.activeGoals.map((goal) => (
                    <Card key={goal.id}>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Target size={18} />
                          {goal.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <p className="text-muted-foreground text-sm">
                          {goal.desiredOutcome}
                        </p>
                        <Badge variant="secondary">{goal.autonomyMode}</Badge>
                        <div>
                          <Button
                            disabled={updateGoalStatus.isPending}
                            onClick={() =>
                              updateGoalStatus.mutate({
                                goalId: goal.id,
                                status: "paused",
                              })
                            }
                            size="sm"
                            variant="secondary"
                          >
                            {updateGoalStatus.isPending
                              ? "更新中…"
                              : "暂停主动跟进"}
                          </Button>
                          <Button
                            disabled={updateGoalStatus.isPending}
                            onClick={() =>
                              updateGoalStatus.mutate({
                                goalId: goal.id,
                                status: "completed",
                              })
                            }
                            size="sm"
                            variant="ghost"
                          >
                            完成目标
                          </Button>
                          <Button
                            disabled={createCommitment.isPending}
                            onClick={() => {
                              setCommitmentGoalId(goal.id);
                              setCommitmentFormError(null);
                            }}
                            size="sm"
                            variant="ghost"
                          >
                            添加承诺
                          </Button>
                        </div>
                        {commitmentGoalId === goal.id ? (
                          <div className="space-y-2">
                            <Input
                              aria-label="承诺内容"
                              disabled={createCommitment.isPending}
                              onChange={(event) =>
                                setCommitmentTitle(event.target.value)
                              }
                              placeholder="例如：与设计确认范围"
                              value={commitmentTitle}
                            />
                            {commitmentFormError ? (
                              <p className="text-destructive text-sm">
                                {commitmentFormError}
                              </p>
                            ) : null}
                            {createCommitment.isError ? (
                              <p className="text-destructive text-sm">
                                创建承诺失败：
                                {failureMessage(createCommitment.error)}
                              </p>
                            ) : null}
                            <div className="flex gap-2">
                              <Button
                                disabled={createCommitment.isPending}
                                onClick={submitCommitment}
                                size="sm"
                              >
                                {createCommitment.isPending
                                  ? "正在添加…"
                                  : "添加开放承诺"}
                              </Button>
                              <Button
                                onClick={() => {
                                  setCommitmentGoalId(null);
                                  setCommitmentTitle("");
                                  setCommitmentFormError(null);
                                }}
                                size="sm"
                                variant="ghost"
                              >
                                取消
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <p className="text-muted-foreground text-sm">
                    还没有活跃目标。创建一个明确目标后，Buni 才能持续跟进。
                  </p>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">开始一个目标</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Input
                      aria-label="目标名称"
                      disabled={createGoal.isPending}
                      onChange={(event) => setGoalTitle(event.target.value)}
                      placeholder="例如：完成 Decision OS 第一阶段"
                      value={goalTitle}
                    />
                    <Textarea
                      aria-label="预期结果"
                      disabled={createGoal.isPending}
                      onChange={(event) => setGoalOutcome(event.target.value)}
                      placeholder="写下可判断的预期结果"
                      value={goalOutcome}
                    />
                    {goalFormError ? (
                      <p className="text-destructive text-sm">
                        {goalFormError}
                      </p>
                    ) : null}
                    {createGoal.isError ? (
                      <p className="text-destructive text-sm">
                        创建失败：{failureMessage(createGoal.error)}
                      </p>
                    ) : null}
                    <Button
                      disabled={createGoal.isPending}
                      onClick={submitGoal}
                      size="sm"
                    >
                      {createGoal.isPending ? "正在创建…" : "创建并激活目标"}
                    </Button>
                  </CardContent>
                </Card>
                {updateGoalStatus.isError ? (
                  <p className="text-destructive text-sm">
                    更新目标失败：{failureMessage(updateGoalStatus.error)}
                  </p>
                ) : null}
              </section>
              <section className="space-y-2">
                <p className="font-medium text-sm">开放承诺</p>
                {overview.data?.openCommitments.length ? (
                  overview.data.openCommitments.map((commitment) => (
                    <Card key={commitment.id} size="sm">
                      <CardContent className="flex items-center justify-between gap-2 py-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle
                            className="text-muted-foreground"
                            size={16}
                          />
                          <span className="text-sm">{commitment.title}</span>
                        </div>
                        {commitment.goalId ? (
                          <Button
                            disabled={updateCommitmentStatus.isPending}
                            onClick={() =>
                              updateCommitmentStatus.mutate({
                                goalId: commitment.goalId as string,
                                commitmentId: commitment.id,
                                status: "done",
                              })
                            }
                            size="sm"
                            variant="ghost"
                          >
                            标记完成
                          </Button>
                        ) : null}
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <p className="text-muted-foreground text-sm">
                    当前没有开放承诺。
                  </p>
                )}
                {updateCommitmentStatus.isError ? (
                  <p className="text-destructive text-sm">
                    更新承诺失败：
                    {failureMessage(updateCommitmentStatus.error)}
                  </p>
                ) : null}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
