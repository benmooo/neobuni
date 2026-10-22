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
  getLatestTaskRunSubtitle,
  getScheduleStatusLabel,
  getScheduleStatusVariant,
  getScheduleTypeLabel,
  getTaskRunStatusLabel,
  getTaskRunStatusVariant,
} from "@/features/schedules/view-model";
import { useSchedules } from "@/hooks/use-schedules";

export const Route = createFileRoute("/_app/schedules/")({
  component: SchedulesPage,
});

function SchedulesPage() {
  const schedulesQuery = useSchedules();

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        actions={
          <Button
            className="rounded-xl text-muted-foreground"
            disabled={schedulesQuery.isFetching}
            onClick={() => void schedulesQuery.refetch()}
            size="icon"
            variant="ghost"
          >
            <ArrowsClockwiseIcon
              className={schedulesQuery.isFetching ? "animate-spin" : undefined}
              size={20}
              weight="regular"
            />
          </Button>
        }
        title="日程"
      />

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="mt-4 flex flex-col gap-4">
          {schedulesQuery.isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          ) : schedulesQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                schedule list 读取失败：
                {schedulesQuery.error instanceof Error
                  ? schedulesQuery.error.message
                  : "请稍后重试。"}
              </AlertDescription>
            </Alert>
          ) : schedulesQuery.data && schedulesQuery.data.length > 0 ? (
            schedulesQuery.data.map((schedule) => (
              <Card key={schedule.id}>
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
                    <div className="flex flex-wrap justify-end gap-2">
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
                <CardContent className="space-y-4">
                  <div className="text-muted-foreground text-sm">
                    {formatScheduleTiming(schedule)}
                  </div>

                  <Card size="sm">
                    <CardContent className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
                          Latest Run
                        </p>
                        <p className="text-foreground text-sm">
                          {getLatestTaskRunSubtitle(schedule)}
                        </p>
                      </div>
                      {schedule.latestTaskRun ? (
                        <Badge
                          variant={getTaskRunStatusVariant(
                            schedule.latestTaskRun.status
                          )}
                        >
                          {getTaskRunStatusLabel(schedule.latestTaskRun.status)}
                        </Badge>
                      ) : null}
                    </CardContent>
                  </Card>

                  <div className="flex justify-end">
                    <Link
                      className="inline-flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-foreground text-sm transition-colors hover:bg-muted"
                      params={{ scheduleId: schedule.id }}
                      to="/schedules/$scheduleId"
                    >
                      查看详情
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Alert>
              <AlertDescription>当前还没有 schedule。</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
