import { Alert, AlertDescription } from "@neobuni/ui/components/alert";
import { Badge } from "@neobuni/ui/components/badge";
import { Button } from "@neobuni/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@neobuni/ui/components/card";
import { Spinner } from "@neobuni/ui/components/spinner";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { PageHeader } from "@/components/PageHeader";
import { useRuntimeRecentActivity } from "@/hooks/use-runtime-activity";
import {
  formatRuntimeProviderSummary,
  formatRuntimeStatus,
  useRuntimeConfig,
} from "@/hooks/use-runtime-config";
import { useRuntimeProviderChecks } from "@/hooks/use-runtime-provider-checks";

export const Route = createFileRoute("/_app/ops/runtime/")({
  component: RuntimeOpsPage,
});

const formatUpdatedAt = (value: number) =>
  value > 0
    ? new Date(value).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

const formatDateTime = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "--";

const formatDuration = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return "--";
  }

  if (value < 1000) {
    return `${value}ms`;
  }

  return `${(value / 1000).toFixed(2)}s`;
};

const getErrorMessage = (value: Record<string, unknown> | null | undefined) => {
  if (!value) {
    return null;
  }

  const message = value.message;
  return typeof message === "string" && message.trim().length > 0
    ? message
    : null;
};

const providerCheckVariant = {
  pass: "outline",
  fail: "destructive",
  skip: "secondary",
} as const;

function StatusChip({ label, ready }: { label: string; ready: boolean }) {
  return (
    <Badge variant={ready ? "outline" : "secondary"}>
      {label}: {ready ? "ready" : "check"}
    </Badge>
  );
}

function RuntimeRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-start justify-between gap-3">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span
          className={
            mono
              ? "text-right font-mono text-[11px] text-foreground"
              : "text-right text-foreground text-xs"
          }
        >
          {value}
        </span>
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

function EventRow({
  title,
  subtitle,
  badges,
  metadata,
  conversationId,
  taskRunId,
  turnId,
}: {
  title: string;
  subtitle?: string | null;
  badges?: React.ReactNode;
  metadata: Array<{ label: string; value: string }>;
  conversationId?: string | null;
  taskRunId?: string | null;
  turnId?: string | null;
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium text-foreground text-sm">{title}</div>
            {subtitle ? (
              <div className="mt-1 text-muted-foreground text-xs">
                {subtitle}
              </div>
            ) : null}
          </div>
          {badges ? (
            <div className="flex shrink-0 flex-wrap gap-2">{badges}</div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {metadata.map((item) => (
            <RuntimeRow
              key={`${title}-${item.label}`}
              label={item.label}
              value={item.value}
            />
          ))}
        </div>

        {taskRunId ? (
          <div className="flex justify-end">
            <Link
              className="rounded-lg border border-border/50 px-3 py-1.5 text-foreground text-xs transition-colors hover:bg-muted"
              params={{ taskRunId }}
              to="/schedules/runs/$taskRunId"
            >
              打开 Task Run
            </Link>
          </div>
        ) : conversationId ? (
          <div className="flex justify-end">
            <Link
              className="rounded-lg border border-border/50 px-3 py-1.5 text-foreground text-xs transition-colors hover:bg-muted"
              params={{ conversationId }}
              search={turnId ? { turnId } : {}}
              to="/chat/$conversationId/runtime"
            >
              打开 Runtime Timeline
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RuntimeOpsPage() {
  const runtimeQuery = useRuntimeConfig();
  const activityQuery = useRuntimeRecentActivity();
  const providerChecksQuery = useRuntimeProviderChecks();
  const runtime = runtimeQuery.data;
  const updatedAt = formatUpdatedAt(runtimeQuery.dataUpdatedAt);
  const activity = activityQuery.data;
  const providerChecks = providerChecksQuery.data;
  const isRefreshing =
    runtimeQuery.isFetching ||
    activityQuery.isFetching ||
    providerChecksQuery.isFetching;

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        actions={
          <Button
            className="rounded-xl text-muted-foreground"
            disabled={isRefreshing}
            onClick={() =>
              void Promise.all([
                runtimeQuery.refetch(),
                activityQuery.refetch(),
                providerChecksQuery.refetch(),
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
        title="Runtime"
      />

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="mt-4 flex flex-col gap-4">
          <Section
            description="排查主库、向量库、sqlite-vec 扩展和 provider readiness。"
            title="Runtime Health"
          >
            {runtimeQuery.isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Spinner className="size-5 text-muted-foreground" />
              </div>
            ) : runtimeQuery.isError ? (
              <Alert variant="destructive">
                <AlertDescription>
                  runtime config 读取失败：
                  {runtimeQuery.error instanceof Error
                    ? runtimeQuery.error.message
                    : "请稍后重试。"}
                </AlertDescription>
              </Alert>
            ) : runtime ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip
                    label="overall"
                    ready={runtime.database.overallReady}
                  />
                  <StatusChip
                    label="main db"
                    ready={runtime.database.main.reachable}
                  />
                  <StatusChip
                    label="vector db"
                    ready={runtime.database.vector.reachable}
                  />
                  <StatusChip
                    label="vec extension"
                    ready={runtime.database.vector.extensionLoaded}
                  />
                  <StatusChip
                    label="vec schema"
                    ready={runtime.database.vector.schemaReady}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <RuntimeRow
                      label="当前 Profile"
                      mono
                      value={runtime.profileId}
                    />
                    <RuntimeRow
                      label="主库"
                      value={formatRuntimeStatus(
                        runtime.database.main.reachable
                      )}
                    />
                    <RuntimeRow
                      label="向量库"
                      value={formatRuntimeStatus(
                        runtime.database.vector.reachable
                      )}
                    />
                    <RuntimeRow
                      label="向量表可查询"
                      value={formatRuntimeStatus(
                        runtime.database.vector.tableQueryable
                      )}
                    />
                    <RuntimeRow
                      label="向量维度"
                      value={`${runtime.database.vector.actualDimensions ?? "unknown"} / ${runtime.database.vector.expectedDimensions}`}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <RuntimeRow
                      label="聊天模型"
                      value={formatRuntimeProviderSummary(
                        runtime.providers.chat
                      )}
                    />
                    <RuntimeRow
                      label="记忆向量化"
                      value={formatRuntimeProviderSummary(
                        runtime.providers.memoryEmbedding
                      )}
                    />
                    <RuntimeRow
                      label="记忆理解"
                      value={formatRuntimeProviderSummary(
                        runtime.providers.memoryReasoning
                      )}
                    />
                    <RuntimeRow
                      label="主库文件"
                      value={
                        runtime.database.main.fileExists ? "exists" : "missing"
                      }
                    />
                    <RuntimeRow
                      label="向量库文件"
                      value={
                        runtime.database.vector.fileExists
                          ? "exists"
                          : "missing"
                      }
                    />
                  </div>
                </div>

                <Card size="sm">
                  <CardContent className="flex flex-col gap-2">
                    <RuntimeRow
                      label="主库路径"
                      mono
                      value={runtime.database.main.filePath}
                    />
                    <RuntimeRow
                      label="向量库路径"
                      mono
                      value={runtime.database.vector.filePath}
                    />
                  </CardContent>
                </Card>

                {runtime.database.overallReady ? null : (
                  <Alert variant="destructive">
                    <AlertDescription>
                      运行时尚未完全就绪。优先检查向量库文件、sqlite-vec
                      扩展是否成功加载，以及 memory embedding provider
                      是否已配置 API Key。
                    </AlertDescription>
                  </Alert>
                )}

                {updatedAt ? (
                  <div className="text-muted-foreground text-xs">
                    最近刷新时间：{updatedAt}
                  </div>
                ) : null}
              </>
            ) : null}
          </Section>

          <Section
            description="直接看最近卡住的 turn、失败或 aborted 的 turn，以及失败的 runtime span。"
            title="Recent Activity"
          >
            {activityQuery.isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Spinner className="size-5 text-muted-foreground" />
              </div>
            ) : activityQuery.isError ? (
              <Alert variant="destructive">
                <AlertDescription>
                  recent runtime activity 读取失败：
                  {activityQuery.error instanceof Error
                    ? activityQuery.error.message
                    : "请稍后重试。"}
                </AlertDescription>
              </Alert>
            ) : activity ? (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div className="space-y-3">
                  <div className="font-medium text-foreground text-sm">
                    Running Turns
                  </div>
                  {activity.runningTurns.length > 0 ? (
                    activity.runningTurns.map((turn) => (
                      <EventRow
                        badges={
                          <Badge className="capitalize" variant="outline">
                            {turn.status}
                          </Badge>
                        }
                        conversationId={turn.conversationId}
                        key={turn.id}
                        metadata={[
                          {
                            label: "Started",
                            value: formatDateTime(turn.startedAt),
                          },
                          {
                            label: "Duration",
                            value: formatDuration(turn.durationMs),
                          },
                          {
                            label: "Conversation",
                            value: turn.conversationId?.slice(0, 8) ?? "--",
                          },
                          { label: "Tools", value: String(turn.toolCallCount) },
                        ]}
                        subtitle={getErrorMessage(turn.errorJson)}
                        taskRunId={turn.taskRunId}
                        title={`${turn.providerKey} / ${turn.modelKey}`}
                        turnId={turn.id}
                      />
                    ))
                  ) : (
                    <Card size="sm">
                      <CardContent className="text-muted-foreground text-sm">
                        当前没有 running turn。
                      </CardContent>
                    </Card>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="font-medium text-foreground text-sm">
                    Problem Turns
                  </div>
                  {activity.recentProblemTurns.length > 0 ? (
                    activity.recentProblemTurns.map((turn) => (
                      <EventRow
                        badges={
                          <Badge className="capitalize" variant="outline">
                            {turn.status}
                          </Badge>
                        }
                        conversationId={turn.conversationId}
                        key={turn.id}
                        metadata={[
                          {
                            label: "Started",
                            value: formatDateTime(turn.startedAt),
                          },
                          {
                            label: "Ended",
                            value: formatDateTime(turn.endedAt),
                          },
                          {
                            label: "Duration",
                            value: formatDuration(turn.durationMs),
                          },
                          {
                            label: "Model",
                            value: `${turn.providerKey} / ${turn.modelKey}`,
                          },
                        ]}
                        subtitle={getErrorMessage(turn.errorJson)}
                        taskRunId={turn.taskRunId}
                        title={turn.errorCode ?? "runtime problem"}
                        turnId={turn.id}
                      />
                    ))
                  ) : (
                    <Card size="sm">
                      <CardContent className="text-muted-foreground text-sm">
                        最近没有 failed / aborted turn。
                      </CardContent>
                    </Card>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="font-medium text-foreground text-sm">
                    Failed Spans
                  </div>
                  {activity.recentFailedSpans.length > 0 ? (
                    activity.recentFailedSpans.map((span) => (
                      <EventRow
                        badges={
                          <Badge className="capitalize" variant="outline">
                            {span.status}
                          </Badge>
                        }
                        conversationId={span.conversationId}
                        key={span.id}
                        metadata={[
                          {
                            label: "Started",
                            value: formatDateTime(span.startedAt),
                          },
                          {
                            label: "Ended",
                            value: formatDateTime(span.endedAt),
                          },
                          {
                            label: "Duration",
                            value: formatDuration(span.durationMs),
                          },
                          { label: "Turn", value: span.turnId.slice(0, 8) },
                        ]}
                        subtitle={getErrorMessage(span.error)}
                        title={span.stage}
                        turnId={span.turnId}
                      />
                    ))
                  ) : (
                    <Card size="sm">
                      <CardContent className="text-muted-foreground text-sm">
                        最近没有 failed span。
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            ) : null}
          </Section>

          <Section
            description="对 chat、embedding、reasoning provider 执行最小 live probe，区分 pass / fail / skip。"
            title="Provider Self-Check"
          >
            {providerChecksQuery.isLoading ? (
              <div className="flex h-24 items-center justify-center">
                <Spinner className="size-5 text-muted-foreground" />
              </div>
            ) : providerChecksQuery.isError ? (
              <Alert variant="destructive">
                <AlertDescription>
                  provider self-check 读取失败：
                  {providerChecksQuery.error instanceof Error
                    ? providerChecksQuery.error.message
                    : "请稍后重试。"}
                </AlertDescription>
              </Alert>
            ) : providerChecks ? (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                {providerChecks.checks.map((check) => (
                  <EventRow
                    badges={
                      <>
                        <Badge variant={providerCheckVariant[check.status]}>
                          {check.status}
                        </Badge>
                        {check.provider ? (
                          <Badge variant="outline">{check.provider}</Badge>
                        ) : null}
                      </>
                    }
                    key={check.slot}
                    metadata={[
                      { label: "Model", value: check.model ?? "--" },
                      {
                        label: "Checked At",
                        value: formatDateTime(check.checkedAt),
                      },
                      {
                        label: "Duration",
                        value: formatDuration(check.durationMs),
                      },
                      {
                        label: "Detail",
                        value: check.detail
                          ? JSON.stringify(check.detail)
                          : "--",
                      },
                    ]}
                    subtitle={check.message}
                    title={check.slot}
                  />
                ))}
              </div>
            ) : null}
          </Section>
        </div>
      </div>
    </div>
  );
}
