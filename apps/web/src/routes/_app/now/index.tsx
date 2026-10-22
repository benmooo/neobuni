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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@neobuni/ui/components/select";
import { Spinner } from "@neobuni/ui/components/spinner";
import { Textarea } from "@neobuni/ui/components/textarea";
import { ArrowsClockwise, CheckCircle, Target } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import {
  useActionRun,
  useCompleteSuggestedCommitment,
  useConfirmActionReceipt,
  useConfirmTelegramSend,
  useCreateActiveGoal,
  useCreateCommitment,
  useCreateTelegramDraft,
  useDecisionEvaluation,
  useDecisionFeedback,
  useEvaluateNextAction,
  useGoals,
  useNowOverview,
  useTelegramChannelTargets,
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
  const decisionEvaluation = useDecisionEvaluation();
  const evaluate = useEvaluateNextAction();
  const feedback = useDecisionFeedback();
  const completeCommitment = useCompleteSuggestedCommitment();
  const createGoal = useCreateActiveGoal();
  const createCommitment = useCreateCommitment();
  const updateGoalStatus = useUpdateGoalStatus();
  const updateCommitmentStatus = useUpdateCommitmentStatus();
  const createTelegramDraft = useCreateTelegramDraft();
  const confirmTelegramSend = useConfirmTelegramSend();
  const confirmActionReceipt = useConfirmActionReceipt();
  const telegramChannelTargets = useTelegramChannelTargets();
  const [goalTitle, setGoalTitle] = useState("");
  const [goalOutcome, setGoalOutcome] = useState("");
  const [goalFormError, setGoalFormError] = useState<string | null>(null);
  const [commitmentGoalId, setCommitmentGoalId] = useState<string | null>(null);
  const [commitmentTitle, setCommitmentTitle] = useState("");
  const [commitmentFormError, setCommitmentFormError] = useState<string | null>(
    null
  );
  const [telegramTargetAlias, setTelegramTargetAlias] = useState("");
  const [telegramText, setTelegramText] = useState("");
  const [telegramDraft, setTelegramDraft] = useState<{
    proposalId: string;
    targetAlias: string;
    text: string;
  } | null>(null);
  const [telegramActionRunId, setTelegramActionRunId] = useState<string | null>(
    null
  );
  const [telegramFormError, setTelegramFormError] = useState<string | null>(
    null
  );
  const telegramActionRun = useActionRun(telegramActionRunId);
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
  const submitTelegramDraft = () => {
    const targetAlias = telegramTargetAlias.trim();
    const text = telegramText.trim();
    if (!(targetAlias && text)) {
      setTelegramFormError("请填写 Telegram 目标别名和消息内容。");
      return;
    }
    setTelegramFormError(null);
    createTelegramDraft.mutate(
      {
        targetAlias,
        text,
        expectedOutcome: "指定 Telegram 频道收到消息，并等待用户确认。",
      },
      {
        onSuccess: ({ proposal }) =>
          setTelegramDraft({ proposalId: proposal.id, targetAlias, text }),
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
                <p className="font-medium text-sm">Telegram 草稿</p>
                <Card size="sm">
                  <CardContent className="space-y-2 py-3">
                    <Select
                      disabled={
                        telegramChannelTargets.isLoading ||
                        createTelegramDraft.isPending ||
                        Boolean(telegramDraft)
                      }
                      onValueChange={(value) =>
                        setTelegramTargetAlias(value ?? "")
                      }
                      value={telegramTargetAlias}
                    >
                      <SelectTrigger aria-label="Telegram 指定频道">
                        <SelectValue placeholder="选择已配置的 Telegram 频道" />
                      </SelectTrigger>
                      <SelectContent>
                        {telegramChannelTargets.data?.map((target) => (
                          <SelectItem key={target.alias} value={target.alias}>
                            {target.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea
                      aria-label="Telegram 消息内容"
                      disabled={
                        createTelegramDraft.isPending || Boolean(telegramDraft)
                      }
                      onChange={(event) => setTelegramText(event.target.value)}
                      placeholder="准备发送的每日摘要"
                      value={telegramText}
                    />
                    {telegramChannelTargets.isError ? (
                      <p className="text-destructive text-sm">
                        无法读取允许的 Telegram 频道：
                        {failureMessage(telegramChannelTargets.error)}
                      </p>
                    ) : null}
                    {!telegramChannelTargets.isLoading &&
                    (telegramChannelTargets.data?.length ?? 0) === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        请先在设置中启用并配置一个 Telegram channel 目标。
                      </p>
                    ) : null}
                    {telegramFormError ? (
                      <p className="text-destructive text-sm">
                        {telegramFormError}
                      </p>
                    ) : null}
                    {createTelegramDraft.isError ? (
                      <p className="text-destructive text-sm">
                        草稿创建失败：
                        {failureMessage(createTelegramDraft.error)}
                      </p>
                    ) : null}
                    {telegramDraft ? (
                      <div className="space-y-2">
                        <Badge variant="secondary">草稿已创建，尚未发送</Badge>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={
                              confirmTelegramSend.isPending ||
                              Boolean(telegramActionRunId)
                            }
                            onClick={() =>
                              confirmTelegramSend.mutate(telegramDraft, {
                                onSuccess: ({ id }) =>
                                  setTelegramActionRunId(id),
                              })
                            }
                            size="sm"
                          >
                            {confirmTelegramSend.isPending
                              ? "发送中…"
                              : "确认发送"}
                          </Button>
                          <Button
                            disabled={confirmTelegramSend.isPending}
                            onClick={() => setTelegramDraft(null)}
                            size="sm"
                            variant="ghost"
                          >
                            放弃草稿
                          </Button>
                        </div>
                        {confirmTelegramSend.isError ? (
                          <p className="text-destructive text-sm">
                            未发送：{failureMessage(confirmTelegramSend.error)}
                          </p>
                        ) : null}
                        {telegramActionRunId ? (
                          <div className="space-y-2">
                            {telegramActionRun.isLoading ? (
                              <p className="text-muted-foreground text-sm">
                                正在读取发送状态…
                              </p>
                            ) : null}
                            {telegramActionRun.isError ? (
                              <p className="text-destructive text-sm">
                                无法读取发送状态：
                                {failureMessage(telegramActionRun.error)}
                              </p>
                            ) : null}
                            {telegramActionRun.data?.status === "queued" ||
                            telegramActionRun.data?.status === "claimed" ||
                            telegramActionRun.data?.status === "running" ? (
                              <p className="text-muted-foreground text-sm">
                                已确认执行，正在等待 Telegram 平台处理。
                              </p>
                            ) : null}
                            {telegramActionRun.data?.status === "failed" ? (
                              <p className="text-destructive text-sm">
                                Telegram
                                发送失败；请检查频道配置后重新创建草稿。
                              </p>
                            ) : null}
                            {telegramActionRun.data?.receipt?.status ===
                            "external_unconfirmed" ? (
                              <>
                                <p className="text-muted-foreground text-sm">
                                  Telegram
                                  已返回平台回执。核实指定频道收到消息后，再确认结果。
                                </p>
                                <Button
                                  disabled={confirmActionReceipt.isPending}
                                  onClick={() =>
                                    confirmActionReceipt.mutate(
                                      telegramActionRunId
                                    )
                                  }
                                  size="sm"
                                  variant="secondary"
                                >
                                  {confirmActionReceipt.isPending
                                    ? "确认中…"
                                    : "确认频道已收到"}
                                </Button>
                              </>
                            ) : null}
                            {telegramActionRun.data?.receipt?.status ===
                            "external_confirmed" ? (
                              <Badge variant="secondary">频道收据已确认</Badge>
                            ) : null}
                            {confirmActionReceipt.isError ? (
                              <p className="text-destructive text-sm">
                                收据未确认：
                                {failureMessage(confirmActionReceipt.error)}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <Button
                        disabled={
                          createTelegramDraft.isPending ||
                          telegramChannelTargets.isLoading ||
                          (telegramChannelTargets.data?.length ?? 0) === 0
                        }
                        onClick={submitTelegramDraft}
                        size="sm"
                      >
                        {createTelegramDraft.isPending ? "创建中…" : "创建草稿"}
                      </Button>
                    )}
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
              <section className="space-y-2">
                <p className="font-medium text-sm">决策健康</p>
                {decisionEvaluation.isError ? (
                  <p className="text-muted-foreground text-sm">
                    决策评估暂不可用。
                  </p>
                ) : decisionEvaluation.data ? (
                  <Card size="sm">
                    <CardContent className="space-y-1 py-3 text-muted-foreground text-sm">
                      <p>
                        检索路由已记录{" "}
                        {
                          decisionEvaluation.data.retrievalRoutingSummary
                            .totalDecisions
                        }{" "}
                        次决策， 其中{" "}
                        {
                          decisionEvaluation.data.retrievalRoutingSummary
                            .comparedJudgmentPairs
                        }{" "}
                        组可比较结果；Graph v2 shadow 不计入此发布门。
                      </p>
                      <p>
                        Jev 与基线一致率：
                        {decisionEvaluation.data.retrievalRoutingSummary
                          .agreementRate === null
                          ? "样本不足"
                          : `${Math.round(decisionEvaluation.data.retrievalRoutingSummary.agreementRate * 100)}%`}
                        。
                      </p>
                      <p>
                        Jev 平均延迟：
                        {decisionEvaluation.data.retrievalRoutingSummary
                          .averageJevLatencyMs === null
                          ? "暂无"
                          : `${Math.round(decisionEvaluation.data.retrievalRoutingSummary.averageJevLatencyMs)} ms`}
                        。
                      </p>
                      <p>
                        Jev provider 错误率：
                        {decisionEvaluation.data.retrievalRoutingSummary
                          .jevProviderErrorRate === null
                          ? "暂无有效尝试"
                          : `${Math.round(decisionEvaluation.data.retrievalRoutingSummary.jevProviderErrorRate * 100)}%`}
                        （
                        {
                          decisionEvaluation.data.retrievalRoutingSummary
                            .jevProviderErrorDecisionCount
                        }
                        /
                        {
                          decisionEvaluation.data.retrievalRoutingSummary
                            .jevAttemptedDecisionCount
                        }
                        ）。
                      </p>
                      <p>
                        Retrieval 路由：
                        {decisionEvaluation.data.releaseGates.retrieval.passed
                          ? "已通过当前发布门槛"
                          : `仍使用确定性回退（${decisionEvaluation.data.releaseGates.retrieval.reasons.join("、")}）`}
                        。
                      </p>
                      <p>
                        Jev 安全回退：
                        {decisionEvaluation.data.decisionReasonsByKind
                          .jev_provider_error ?? 0}{" "}
                        次 provider 错误，
                        {decisionEvaluation.data.decisionReasonsByKind
                          .jev_provider_unavailable ?? 0}{" "}
                        次配置不可用。
                      </p>
                      <p>
                        主动打扰评估已记录{" "}
                        {
                          decisionEvaluation.data.initiativeInterruptionSummary
                            .totalDecisions
                        }{" "}
                        次；
                        {
                          decisionEvaluation.data.initiativeInterruptionSummary
                            .comparedJudgmentPairs
                        }{" "}
                        组 Jev 与基线可比较结果。
                      </p>
                      <p>
                        主动打扰评估仅用于观察：不会发送通知或改变当前建议。
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    正在读取决策指标…
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
