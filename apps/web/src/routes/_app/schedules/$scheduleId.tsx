import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@neobuni/ui/components/accordion";
import { Alert, AlertDescription } from "@neobuni/ui/components/alert";
import { Badge } from "@neobuni/ui/components/badge";
import { Button } from "@neobuni/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@neobuni/ui/components/card";
import { Spinner } from "@neobuni/ui/components/spinner";
import { ArrowRight, ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { PageHeader } from "@/components/PageHeader";
import {
  formatScheduleTiming,
  getScheduleStatusLabel,
  getScheduleStatusVariant,
  getScheduleTypeLabel,
  getTaskRunStatusLabel,
  getTaskRunStatusVariant,
  resolveTaskRunErrorMessage,
} from "@/features/schedules/view-model";
import { useScheduleDetail, useScheduleTaskRuns } from "@/hooks/use-schedules";

export const Route = createFileRoute("/_app/schedules/$scheduleId")({
  component: ScheduleDetailPage,
});

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

function JsonPreview({
  title,
  value,
  itemValue,
}: {
  title: string;
  value: unknown;
  itemValue: string;
}) {
  if (value === null || value === undefined) {
    return null;
  }

  return (
    <Accordion defaultValue={[]}>
      <AccordionItem className="border-none" value={itemValue}>
        <AccordionTrigger className="py-0 text-muted-foreground text-xs hover:no-underline">
          {title}
        </AccordionTrigger>
        <AccordionContent className="pt-3">
          <Card size="sm">
            <CardContent>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[11px] text-foreground">
                {prettyJson(value)}
              </pre>
            </CardContent>
          </Card>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function ScheduleDetailPage() {
  const { scheduleId } = Route.useParams();
  const scheduleQuery = useScheduleDetail(scheduleId);
  const taskRunsQuery = useScheduleTaskRuns(scheduleId);
  const schedule = scheduleQuery.data;
  const blueprint = schedule?.blueprint ?? null;
  const isRefreshing = scheduleQuery.isFetching || taskRunsQuery.isFetching;

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        actions={
          <Button
            className="rounded-xl text-muted-foreground"
            disabled={isRefreshing}
            onClick={() =>
              void Promise.all([
                scheduleQuery.refetch(),
                taskRunsQuery.refetch(),
              ])
            }
            size="icon"
            variant="ghost"
          >
            <ArrowsClockwiseIcon
              className={isRefreshing ? "animate-spin" : undefined}
              size={20}
              weight="regular"
            />
          </Button>
        }
        title={schedule?.title ?? "日程详情"}
      />

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="mt-4 flex flex-col gap-4">
          {scheduleQuery.isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          ) : scheduleQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                schedule detail 读取失败：
                {scheduleQuery.error instanceof Error
                  ? scheduleQuery.error.message
                  : "请稍后重试。"}
              </AlertDescription>
            </Alert>
          ) : schedule ? (
            <>
              <Card>
                <CardHeader className="gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-base">
                        {schedule.title}
                      </CardTitle>
                      <p className="text-muted-foreground text-sm">
                        {schedule.content}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        {getScheduleTypeLabel(schedule.type)}
                      </Badge>
                      <Badge
                        variant={getScheduleStatusVariant(schedule.status)}
                      >
                        {getScheduleStatusLabel(schedule.status)}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-muted-foreground text-sm">
                    {formatScheduleTiming(schedule)}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="text-muted-foreground text-sm">
                      last materialized{" "}
                      <span className="text-foreground">
                        {schedule.lastMaterializedAt ?? "--"}
                      </span>
                    </div>
                    <div className="text-muted-foreground text-sm">
                      delivered{" "}
                      <span className="text-foreground">
                        {schedule.deliveredAt ?? "--"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Blueprint</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {blueprint ? (
                    <>
                      <Card size="sm">
                        <CardContent>
                          <p className="text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
                            Prompt
                          </p>
                          <p className="mt-2 whitespace-pre-wrap text-foreground text-sm">
                            {blueprint.prompt}
                          </p>
                        </CardContent>
                      </Card>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="text-muted-foreground text-sm">
                          timeout{" "}
                          <span className="text-foreground">
                            {blueprint.timeoutMs ?? "--"}
                          </span>
                        </div>
                        <div className="text-muted-foreground text-sm">
                          max steps{" "}
                          <span className="text-foreground">
                            {blueprint.maxSteps ?? "--"}
                          </span>
                        </div>
                      </div>

                      <JsonPreview
                        itemValue="tool-allowlist"
                        title="Tool Allowlist"
                        value={blueprint.toolAllowlist}
                      />
                      <JsonPreview
                        itemValue="delivery-intent"
                        title="Delivery Intent"
                        value={blueprint.deliveryIntent}
                      />
                      <JsonPreview
                        itemValue="input-snapshot"
                        title="Input Snapshot"
                        value={blueprint.input}
                      />
                    </>
                  ) : (
                    <Alert>
                      <AlertDescription>
                        这个 schedule 还没有 blueprint。
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Run History</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {taskRunsQuery.isLoading ? (
                    <div className="flex h-24 items-center justify-center">
                      <Spinner className="size-5 text-muted-foreground" />
                    </div>
                  ) : taskRunsQuery.isError ? (
                    <Alert variant="destructive">
                      <AlertDescription>
                        task runs 读取失败：
                        {taskRunsQuery.error instanceof Error
                          ? taskRunsQuery.error.message
                          : "请稍后重试。"}
                      </AlertDescription>
                    </Alert>
                  ) : taskRunsQuery.data && taskRunsQuery.data.length > 0 ? (
                    taskRunsQuery.data.map((taskRun) => (
                      <Card key={taskRun.id} size="sm">
                        <CardContent className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="font-medium text-foreground text-sm">
                                {taskRun.id}
                              </p>
                              <p className="text-muted-foreground text-xs">
                                scheduled {taskRun.scheduledFor}
                              </p>
                            </div>
                            <Badge
                              variant={getTaskRunStatusVariant(taskRun.status)}
                            >
                              {getTaskRunStatusLabel(taskRun.status)}
                            </Badge>
                          </div>

                          {resolveTaskRunErrorMessage(taskRun) ? (
                            <Alert variant="destructive">
                              <AlertDescription>
                                {resolveTaskRunErrorMessage(taskRun)}
                              </AlertDescription>
                            </Alert>
                          ) : null}

                          <div className="flex justify-end">
                            <Link
                              className="inline-flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-foreground text-sm transition-colors hover:bg-muted"
                              params={{ taskRunId: taskRun.id }}
                              to="/schedules/runs/$taskRunId"
                            >
                              查看执行详情
                              <ArrowRight size={14} />
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Alert>
                      <AlertDescription>
                        这个 schedule 还没有 task run。
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
