import type { StudyPlanNode, StudySession } from "@neobuni/contracts";
import { Button } from "@neobuni/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@neobuni/ui/components/card";
import { Spinner } from "@neobuni/ui/components/spinner";
import { ArrowRight, Sparkle } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";

import { useEnrichStudyLesson, useStartStudySession } from "@/hooks/use-study";

import { PAPER_LABELS, splitConcepts } from "../lesson-data";
import { EYEBROW, META, TAG } from "./styles";

interface Props {
  goalId: string;
  node: StudyPlanNode;
  onSkip: () => void;
  session: StudySession;
}

/**
 * Today's lesson as a glanceable card: eyebrow, title, one-line objective and
 * the concepts to watch for. Reading happens on the lesson page.
 */
function TodayLessonCard({ goalId, node, session, onSkip }: Props) {
  const navigate = useNavigate();
  const start = useStartStudySession();
  const enrich = useEnrichStudyLesson();
  const concepts = splitConcepts(node).slice(0, 3);
  const objective = node.enrichment?.objective ?? node.objective;
  const hasMaterial = Boolean(node.enrichment?.material);
  const continueSession = session.status === "in_progress";

  const open = () => {
    void navigate({
      params: { goalId, planNodeId: node.id },
      to: "/study/$goalId/lesson/$planNodeId",
    });
    start.mutate({ goalId, planNodeId: node.id });
  };

  return (
    <Card className="gap-0 py-0">
      <div className="h-1 w-full bg-primary" />
      <CardHeader className="gap-2 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className={EYEBROW}>今天的课 · {PAPER_LABELS[node.paper]}</span>
          <span className={META}>{session.durationMinutes} MIN</span>
        </div>
        <CardTitle className="line-clamp-2 font-heading text-lg leading-snug">
          {node.title}
        </CardTitle>
        {objective ? (
          <p className="line-clamp-2 text-muted-foreground text-sm leading-relaxed">
            {objective}
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-2 pb-3">
        {concepts.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {concepts.map((concept) => (
              <span className={TAG} key={concept}>
                {concept}
              </span>
            ))}
          </div>
        ) : null}
        {node.enrichment ? null : (
          <p className="text-muted-foreground text-xs">
            教材还没生成，进入后可以让 AI 细化这一节。
          </p>
        )}
        {enrich.isError ? (
          <p className="text-destructive text-xs">
            细化失败：
            {enrich.error instanceof Error
              ? enrich.error.message
              : String(enrich.error)}
          </p>
        ) : null}
      </CardContent>

      <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
        <Button
          className="flex-1 sm:flex-none"
          disabled={start.isPending}
          onClick={open}
          size="lg"
        >
          {start.isPending ? (
            <>
              <Spinner className="size-4" />
              准备中…
            </>
          ) : (
            <>
              {continueSession ? "继续学习" : "开始学习"}
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
        <Button disabled={start.isPending} onClick={onSkip} variant="ghost">
          今天跳过
        </Button>
        <div className="flex-1" />
        {node.enrichment ? null : (
          <Button
            disabled={enrich.isPending}
            onClick={() =>
              enrich.mutate({ force: false, goalId, planNodeId: node.id })
            }
            size="sm"
            variant="ghost"
          >
            {enrich.isPending ? (
              <>
                <Spinner className="size-3.5" />
                细化中…
              </>
            ) : (
              <>
                <Sparkle className="size-3.5" />用 AI 细化
              </>
            )}
          </Button>
        )}
        {node.enrichment && !hasMaterial ? (
          <Button
            disabled={enrich.isPending}
            onClick={() =>
              enrich.mutate({ force: true, goalId, planNodeId: node.id })
            }
            size="sm"
            variant="ghost"
          >
            {enrich.isPending ? (
              <>
                <Spinner className="size-3.5" />
                生成中…
              </>
            ) : (
              "生成教材内容"
            )}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

export { TodayLessonCard };
