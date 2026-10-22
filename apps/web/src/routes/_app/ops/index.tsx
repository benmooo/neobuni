import { Alert, AlertDescription } from "@neobuni/ui/components/alert";
import { Badge } from "@neobuni/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@neobuni/ui/components/card";
import { Spinner } from "@neobuni/ui/components/spinner";
import {
  ArrowRight,
  CheckCircle,
  TerminalWindow,
  WarningCircle,
} from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { PageHeader } from "@/components/PageHeader";
import { useRuntimeConfig } from "@/hooks/use-runtime-config";

export const Route = createFileRoute("/_app/ops/")({
  component: OpsPage,
});

function OpsPage() {
  const runtimeQuery = useRuntimeConfig();
  const runtime = runtimeQuery.data;
  const issueCount = runtime
    ? [
        !runtime.database.overallReady,
        !runtime.database.main.reachable,
        !runtime.database.vector.reachable,
        !runtime.database.vector.extensionLoaded,
        !runtime.database.vector.schemaReady,
        !runtime.database.vector.tableQueryable,
      ].filter(Boolean).length
    : 0;

  return (
    <div className="flex h-screen flex-col">
      <PageHeader title="Ops" />

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="mt-4 flex flex-col gap-4">
          <Card>
            <CardHeader className="gap-1">
              <CardTitle>Operator Console</CardTitle>
              <CardDescription className="text-sm">
                `ops` 承接运行时排障、系统健康和 operator-only
                surface。`settings` 只保留用户配置。
              </CardDescription>
            </CardHeader>
          </Card>

          {runtimeQuery.isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          ) : runtimeQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                读取 runtime summary 失败：
                {runtimeQuery.error instanceof Error
                  ? runtimeQuery.error.message
                  : "请稍后重试。"}
              </AlertDescription>
            </Alert>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="rounded-2xl border border-border/50 p-2 text-muted-foreground">
                      <TerminalWindow size={18} weight="duotone" />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <CardTitle className="text-base">Runtime</CardTitle>
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant={issueCount > 0 ? "secondary" : "outline"}
                        >
                          {issueCount > 0 ? (
                            <WarningCircle className="mr-1" size={12} />
                          ) : (
                            <CheckCircle className="mr-1" size={12} />
                          )}
                          {issueCount > 0 ? `${issueCount} issues` : "healthy"}
                        </Badge>
                        <Badge variant="outline">
                          profile {runtime?.profileId ?? "unknown"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground text-sm">
                  排查双库、sqlite-vec、provider readiness 和 runtime config
                  是否已真正就绪。
                </p>
                <Card size="sm">
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">
                        Overall Ready
                      </span>
                      <Badge
                        variant={
                          runtime?.database.overallReady
                            ? "outline"
                            : "secondary"
                        }
                      >
                        {runtime?.database.overallReady ? "ready" : "check"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">
                        Main / Vector DB
                      </span>
                      <span className="text-foreground">
                        {runtime?.database.main.reachable ? "ready" : "check"} /{" "}
                        {runtime?.database.vector.reachable ? "ready" : "check"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
                <Link
                  className="inline-flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-foreground text-sm transition-colors hover:bg-muted"
                  to="/ops/runtime"
                >
                  进入 Runtime console
                  <ArrowRight size={14} />
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
