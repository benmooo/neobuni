import type {
  StudyLessonEnrichment,
  StudyMastery,
  StudyPlanNode,
  StudySession,
  StudySessionStatus,
} from "@neobuni/contracts";
import { Button } from "@neobuni/ui/components/button";
import { Skeleton } from "@neobuni/ui/components/skeleton";
import { Spinner } from "@neobuni/ui/components/spinner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@neobuni/ui/components/tabs";
import {
  BookOpenText,
  CheckCircle,
  Lightning,
  Sparkle,
  Target,
} from "@phosphor-icons/react";
import { useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import {
  useEnrichStudyLesson,
  useStartStudySession,
  useStudyGoalDetail,
} from "@/hooks/use-study";

import {
  findLessonNode,
  findLessonSession,
  formatLocalDateTime,
  lessonStorageKey,
  PAPER_LABELS,
  readStoredValue,
  splitConcepts,
  splitSentences,
  writeStoredValue,
} from "../lesson-data";
import { ChecksTab } from "./checks-tab";
import { AnchorsTab, MaterialTab } from "./material-tab";
import { DOT, EYEBROW, META, PROSE, TAG } from "./styles";

const TABS = [
  { icon: Target, label: "目标", value: "overview" },
  { icon: BookOpenText, label: "精读", value: "material" },
  { icon: Lightning, label: "速记", value: "anchors" },
  { icon: CheckCircle, label: "自检", value: "checks" },
] as const;

type LessonTab = (typeof TABS)[number]["value"];

const SESSION_LABELS: Record<StudySessionStatus, string> = {
  planned: "未开始",
  in_progress: "进行中",
  completed: "已完成",
  skipped: "已跳过",
  missed: "未完成",
};

const isLessonTab = (value: string | null): value is LessonTab =>
  TABS.some((tab) => tab.value === value);

const Section = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <section className="space-y-2.5">
    <h3 className={EYEBROW}>{label}</h3>
    {children}
  </section>
);

function OverviewTab({
  enrichment,
  node,
  session,
}: {
  enrichment: StudyLessonEnrichment | null;
  node: StudyPlanNode;
  session: StudySession | null;
}) {
  const objective = enrichment?.objective ?? node.objective;
  const concepts = splitConcepts(node);
  const steps = splitSentences(enrichment?.howText ?? node.howText);
  const resources = enrichment?.resources ?? node.resources;

  return (
    <div className="space-y-6">
      <Section label="本节目标">
        <p className={`${PROSE} max-w-prose`}>{objective ?? node.title}</p>
      </Section>

      {concepts.length > 0 ? (
        <Section label="要记住的概念">
          <div className="flex flex-wrap gap-1">
            {concepts.map((concept) => (
              <span className={TAG} key={concept}>
                {concept}
              </span>
            ))}
          </div>
        </Section>
      ) : null}

      {steps.length > 0 ? (
        <Section label={`怎么学 · 建议 ${node.estimatedMinutes} 分钟`}>
          <ol className="max-w-prose space-y-2.5">
            {steps.map((step, index) => (
              <li className="flex gap-2.5" key={`${index}-${step.slice(0, 8)}`}>
                <span className="mt-1 grid size-4 shrink-0 place-items-center border border-primary/40 font-heading text-[0.625rem] text-primary tabular-nums">
                  {index + 1}
                </span>
                <span className={PROSE}>{step}</span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {resources.length > 0 ? (
        <Section label="参考资料">
          <ul className="max-w-prose divide-y border-t">
            {resources.map((resource) => (
              <li
                className="py-2 text-muted-foreground text-sm leading-6"
                key={resource}
              >
                {resource}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {session?.status === "completed" ? (
        <p className="text-muted-foreground text-xs">
          本节已于 {formatLocalDateTime(session.scheduledFor)} 完成自检。
        </p>
      ) : null}
    </div>
  );
}

interface Props {
  goalId: string;
  planNodeId: string;
}

export function LessonPage({ goalId, planNodeId }: Props) {
  const detail = useStudyGoalDetail(goalId);
  const start = useStartStudySession();
  const enrich = useEnrichStudyLesson();
  const tabKey = lessonStorageKey("tab", goalId, planNodeId);
  const [tab, setTab] = useState<LessonTab>(() => {
    const stored = readStoredValue(tabKey);
    return isLessonTab(stored) ? stored : "overview";
  });

  const nodes = detail.data?.plan?.nodes ?? [];
  const node = findLessonNode(nodes, planNodeId);
  const session = detail.data
    ? findLessonSession(detail.data.sessions, planNodeId)
    : null;
  const mastery: StudyMastery | undefined = detail.data?.mastery.find(
    (item) => item.planNodeId === planNodeId
  );

  const changeTab = (value: string) => {
    if (!isLessonTab(value)) {
      return;
    }
    setTab(value);
    writeStoredValue(tabKey, value);
  };

  const startSession = () => {
    start.mutate({ goalId, planNodeId });
  };

  if (detail.isPending) {
    return (
      <div className="flex h-screen flex-col">
        <PageHeader title="学习" />
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl space-y-3 px-4 py-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (detail.isError || !node) {
    return (
      <div className="flex h-screen flex-col">
        <PageHeader title="学习" />
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-4 py-4">
            <p className="text-muted-foreground text-sm">
              找不到这一节（可能计划已重新生成）。
            </p>
          </div>
        </div>
      </div>
    );
  }

  const enrichment = node.enrichment ?? null;
  const material = enrichment?.material ?? null;
  const canGenerate = !(enrichment && material);
  const objective = enrichment?.objective ?? node.objective;
  const concepts = splitConcepts(node).slice(0, 4);
  const generate = () =>
    enrich.mutate({ force: Boolean(enrichment), goalId, planNodeId });

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        actions={
          <Button
            disabled={enrich.isPending}
            onClick={generate}
            size="sm"
            variant={canGenerate ? "default" : "ghost"}
          >
            {enrich.isPending ? (
              <>
                <Spinner className="size-3.5" />
                {material ? "重新生成中…" : "细化中…"}
              </>
            ) : (
              <>
                <Sparkle className="size-3.5" />
                {material
                  ? "重新生成教材"
                  : enrichment
                    ? "生成教材内容"
                    : "用 AI 细化"}
              </>
            )}
          </Button>
        }
        title={node.title}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 pb-24">
          <div className="space-y-2.5 border-b py-4">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span className={`${EYEBROW} text-primary`}>
                {PAPER_LABELS[node.paper]}
              </span>
              <span className={DOT}>·</span>
              <span className={META}>{node.estimatedMinutes} 分钟</span>
              {session ? (
                <>
                  <span className={DOT}>·</span>
                  <span className={META}>
                    {SESSION_LABELS[session.status]} ·{" "}
                    {formatLocalDateTime(session.scheduledFor)}
                  </span>
                </>
              ) : null}
              {mastery ? (
                <>
                  <span className={DOT}>·</span>
                  <span className={META}>
                    掌握度 {Math.round(mastery.score * 100)}%
                  </span>
                </>
              ) : null}
              {enrichment ? null : (
                <>
                  <span className={DOT}>·</span>
                  <span className={META}>未生成教材</span>
                </>
              )}
            </div>
            {objective ? (
              <p className={`${PROSE} border-primary border-l-2 pl-2.5`}>
                {objective}
              </p>
            ) : null}
            {concepts.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {concepts.map((concept) => (
                  <span className={TAG} key={concept}>
                    {concept}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {session?.status === "planned" ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-primary border-l-2 bg-primary/5 py-2 pr-2 pl-2.5">
              <p className="text-sm">
                这一节排在 {formatLocalDateTime(session.scheduledFor)}
                ，现在也可以提前学。
              </p>
              <Button
                disabled={start.isPending}
                onClick={startSession}
                size="sm"
                variant="outline"
              >
                {start.isPending ? (
                  <>
                    <Spinner className="size-3.5" />
                    准备中…
                  </>
                ) : (
                  "现在开始"
                )}
              </Button>
            </div>
          ) : null}

          {enrich.isError ? (
            <p className="mt-3 text-destructive text-xs">
              生成失败：
              {enrich.error instanceof Error
                ? enrich.error.message
                : String(enrich.error)}
            </p>
          ) : null}

          <Tabs className="mt-4" onValueChange={changeTab} value={tab}>
            <TabsList
              className="sticky top-0 z-10 -mx-4 w-full justify-start gap-1 border-b bg-background px-4"
              variant="line"
            >
              {TABS.map((item) => (
                <TabsTrigger key={item.value} value={item.value}>
                  <item.icon className="size-3.5" />
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent className="pt-5" value="overview">
              <OverviewTab
                enrichment={enrichment}
                node={node}
                session={session}
              />
            </TabsContent>
            <TabsContent className="pt-4" value="material">
              <MaterialTab
                isGenerating={enrich.isPending}
                material={material}
                onGenerate={generate}
                storageKey={lessonStorageKey("section", goalId, planNodeId)}
                title={node.title}
              />
            </TabsContent>
            <TabsContent className="pt-4" value="anchors">
              <AnchorsTab material={material} />
            </TabsContent>
            <TabsContent className="pt-4" value="checks">
              <ChecksTab
                isStarting={start.isPending}
                mastery={mastery}
                node={node}
                onStart={startSession}
                session={session}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
