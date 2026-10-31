import type {
  StudyCheckKind,
  StudyCheckResult,
  StudyMastery,
  StudyPlanNode,
  StudySession,
} from "@neobuni/contracts";
import { Badge } from "@neobuni/ui/components/badge";
import { Button } from "@neobuni/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@neobuni/ui/components/collapsible";
import { Progress } from "@neobuni/ui/components/progress";
import { Spinner } from "@neobuni/ui/components/spinner";
import { Textarea } from "@neobuni/ui/components/textarea";
import { CaretDown, CheckCircle, Lightbulb } from "@phosphor-icons/react";
import { useState } from "react";

import { useSubmitStudyChecks } from "@/hooks/use-study";

import { formatLocalDateTime } from "../lesson-data";
import { EYEBROW, META, PROSE, TAG } from "./styles";

const KIND_LABELS: Record<StudyCheckKind, string> = {
  recall: "回忆",
  mcq: "选择",
  case: "案例",
  essay: "论述",
  mock: "模拟",
};

const messageOf = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

interface Props {
  isStarting: boolean;
  mastery: StudyMastery | undefined;
  node: StudyPlanNode;
  onStart: () => void;
  session: StudySession | null;
}

function ResultView({ result }: { result: StudyCheckResult }) {
  const score = Math.round(result.score * 100);
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className={EYEBROW}>判分结果</span>
          <Badge variant={result.passed ? "default" : "destructive"}>
            {result.passed ? "通过" : "未通过"}
          </Badge>
        </div>
        <p className="font-heading text-3xl tabular-nums">
          {score}
          <span className="ml-1 font-sans text-muted-foreground text-sm">
            / 100
          </span>
        </p>
        <Progress value={score} />
        <p className="text-muted-foreground text-xs">
          掌握度 {Math.round(result.mastery * 100)}%
          {result.nextReviewAt ? ` · 下次复习 ${result.nextReviewAt}` : ""}
          {result.needsReteach ? " · 建议先重读「常见陷阱」" : ""}
        </p>
      </div>

      <div className="divide-y border-t">
        {result.items.map((item, index) => (
          <div className="space-y-1.5 py-3" key={item.promptId}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-heading text-[0.6875rem] tabular-nums">
                第 {index + 1} 题 · {Math.round(item.score * 100)}
              </span>
              <span
                className={
                  item.passed
                    ? `${TAG} border-primary/40 text-primary`
                    : `${TAG} border-destructive/40 text-destructive`
                }
              >
                {item.passed ? "达标" : "需重学"}
              </span>
            </div>
            <p className={PROSE}>{item.feedback}</p>
            {item.missingPoints.length > 0 ? (
              <p className="text-muted-foreground text-xs">
                漏点：{item.missingPoints.join("、")}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChecksTab({
  isStarting,
  mastery,
  node,
  onStart,
  session,
}: Props) {
  const specs = node.enrichment?.checkSpecs ?? node.checkSpecs;
  const submitChecks = useSubmitStudyChecks();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<StudyCheckResult | null>(null);
  const [retaking, setRetaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (specs.length === 0) {
    return (
      <p className="border border-border border-dashed px-4 py-6 text-center text-muted-foreground text-sm">
        这一节还没有自检题。
      </p>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-start gap-3 border border-border border-dashed px-4 py-6">
        <CheckCircle className="size-5 text-muted-foreground" />
        <p className={`${PROSE} text-muted-foreground`}>
          先开始这一节，才能提交自检并记录掌握度。
        </p>
        <Button disabled={isStarting} onClick={onStart} size="lg">
          {isStarting ? (
            <>
              <Spinner className="size-4" />
              准备中…
            </>
          ) : (
            "开始学习"
          )}
        </Button>
      </div>
    );
  }

  if (session.status === "completed" && !(result || retaking)) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className={EYEBROW}>自检</span>
          <Badge variant="secondary">已完成</Badge>
        </div>
        <p className={PROSE}>
          {mastery
            ? `掌握度 ${Math.round(mastery.score * 100)}%${
                mastery.nextReviewAt
                  ? ` · 下次复习 ${mastery.nextReviewAt}`
                  : ""
              }`
            : "这一节已经完成。"}
        </p>
        <p className="text-muted-foreground text-xs">
          想再练一遍可以重做，成绩会覆盖本次掌握度。
        </p>
        <Button onClick={() => setRetaking(true)} variant="outline">
          重做自检
        </Button>
      </div>
    );
  }

  if (result) {
    return (
      <div className="space-y-4">
        <ResultView result={result} />
        <Button
          onClick={() => {
            setResult(null);
            setRetaking(false);
          }}
          variant="outline"
        >
          再练一次
        </Button>
      </div>
    );
  }

  const spec = specs[index] ?? specs[0];
  const answer = answers[spec.id] ?? "";
  const isLast = index === specs.length - 1;
  const allAnswered = specs.every(
    (item) => (answers[item.id] ?? "").trim().length > 0
  );

  const submit = async () => {
    setError(null);
    try {
      const graded = await submitChecks.mutateAsync({
        answers: specs.map((item) => ({
          answer: (answers[item.id] ?? "").trim(),
          promptId: item.id,
        })),
        sessionId: session.id,
      });
      setResult(graded);
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={EYEBROW}>自检</span>
          <span className={`${TAG} border-primary/40 text-primary`}>
            {KIND_LABELS[spec.kind]}
          </span>
        </div>
        <span className={META}>
          第 {index + 1} / {specs.length} 题
        </span>
      </div>
      <Progress value={Math.round(((index + 1) / specs.length) * 100)} />

      <p className="max-w-prose whitespace-pre-line text-base leading-7">
        {spec.prompt}
      </p>

      {spec.rubric ? (
        <Collapsible>
          <CollapsibleTrigger
            render={
              <Button size="xs" variant="ghost">
                <Lightbulb className="size-3" />
                看看评分要点
                <CaretDown className="size-2.5" />
              </Button>
            }
          />
          <CollapsibleContent className="mt-2 border-border border-l-2 pl-2.5 text-muted-foreground text-sm leading-6">
            {spec.rubric}
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      <Textarea
        className="min-h-32"
        onChange={(event) =>
          setAnswers((current) => ({
            ...current,
            [spec.id]: event.target.value,
          }))
        }
        placeholder="写下关键词和因果链就够了，不必写成文章…"
        rows={5}
        value={answer}
      />

      {error ? <p className="text-destructive text-xs">{error}</p> : null}

      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <Button
          disabled={index === 0}
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          variant="ghost"
        >
          上一题
        </Button>
        <div className="flex items-center gap-2">
          <span className="hidden text-muted-foreground text-xs sm:inline">
            不看资料回答
          </span>
          {isLast ? (
            <Button
              disabled={!(allAnswered && !submitChecks.isPending)}
              onClick={() => void submit()}
              size="lg"
            >
              {submitChecks.isPending ? (
                <>
                  <Spinner className="size-4" />
                  判分中…
                </>
              ) : (
                "提交判分"
              )}
            </Button>
          ) : (
            <Button
              disabled={answer.trim().length === 0}
              onClick={() => setIndex((value) => value + 1)}
              size="lg"
            >
              下一题
            </Button>
          )}
        </div>
      </div>

      {session.status === "in_progress" ? null : (
        <p className="text-muted-foreground text-xs">
          当前课时状态：{session.status} · 计划{" "}
          {formatLocalDateTime(session.scheduledFor)}
        </p>
      )}
    </div>
  );
}
