import type { runtimeSpanSchema, runtimeTurnSchema } from "@neobuni/contracts";
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
import type { z } from "zod";

type RuntimeTurn = z.infer<typeof runtimeTurnSchema>;
type RuntimeSpan = z.infer<typeof runtimeSpanSchema>;

const statusVariant = {
  running: "secondary",
  completed: "outline",
  failed: "destructive",
  aborted: "destructive",
  skipped: "secondary",
} as const;

const stageLabel = {
  request_received: "Request Received",
  user_message_persist: "User Message Persist",
  turn_context_load: "Turn Context Load",
  signal_normalization: "Signal Normalization",
  retrieval_signals: "Retrieval Signals",
  retrieval_plan: "Retrieval Plan",
  temporal_recall: "Temporal Recall",
  graph_recall: "Graph Recall",
  knowledge_recall: "Knowledge Recall",
  evidence_fusion: "Evidence Fusion",
  working_memory_build: "Working Memory Build",
  soul_runtime: "Soul Runtime",
  soul_decision: "Soul Decision",
  response_spec_build: "Response Spec Build",
  prompt_build: "Prompt Build",
  prompt_compile: "Prompt Compile",
  provider_stream: "Provider Stream",
  tool_call: "Tool Call",
  assistant_message_persist: "Assistant Message Persist",
  turn_finalize: "Turn Finalize",
} as const;

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

const formatDuration = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return "--";
  }

  if (value < 1000) {
    return `${value}ms`;
  }

  return `${(value / 1000).toFixed(2)}s`;
};

const formatTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
};

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

function SpanCard({ span }: { span: RuntimeSpan }) {
  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-sm">
              {stageLabel[span.stage as keyof typeof stageLabel] ?? span.stage}
            </CardTitle>
            <p className="text-muted-foreground text-xs">
              {formatTimestamp(span.startedAt)} -{" "}
              {formatTimestamp(span.endedAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={statusVariant[span.status as keyof typeof statusVariant]}
            >
              {span.status}
            </Badge>
            <Badge variant="secondary">{formatDuration(span.durationMs)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <JsonPreview
          itemValue={`${span.id}-input`}
          title="Input"
          value={span.input}
        />
        <JsonPreview
          itemValue={`${span.id}-output`}
          title="Output"
          value={span.output}
        />
        <JsonPreview
          itemValue={`${span.id}-error`}
          title="Error"
          value={span.error}
        />
      </CardContent>
    </Card>
  );
}

function TaskRunTracePanel({
  runtimeTurn,
  spans,
  isLoading,
  isRefreshing,
  onRefresh,
}: {
  runtimeTurn: RuntimeTurn | null;
  spans: RuntimeSpan[];
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    );
  }

  if (!runtimeTurn) {
    return (
      <Alert>
        <AlertDescription>
          这个 task run 还没有 runtime
          turn。可能还没开始执行，或者执行前就被取消了。
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>Runtime Trace</CardTitle>
              <p className="text-muted-foreground text-xs">
                turn {runtimeTurn.id.slice(0, 8)}
              </p>
            </div>
            <Button
              disabled={isRefreshing}
              onClick={onRefresh}
              size="sm"
              variant="ghost"
            >
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="text-muted-foreground text-sm">
            status <span className="text-foreground">{runtimeTurn.status}</span>
          </div>
          <div className="text-muted-foreground text-sm">
            provider{" "}
            <span className="text-foreground">{runtimeTurn.providerKey}</span>
          </div>
          <div className="text-muted-foreground text-sm">
            model{" "}
            <span className="text-foreground">{runtimeTurn.modelKey}</span>
          </div>
          <div className="text-muted-foreground text-sm">
            started{" "}
            <span className="text-foreground">
              {formatTimestamp(runtimeTurn.startedAt)}
            </span>
          </div>
          <div className="text-muted-foreground text-sm">
            ended{" "}
            <span className="text-foreground">
              {formatTimestamp(runtimeTurn.endedAt)}
            </span>
          </div>
          <div className="text-muted-foreground text-sm">
            duration{" "}
            <span className="text-foreground">
              {formatDuration(runtimeTurn.durationMs)}
            </span>
          </div>
          <div className="text-muted-foreground text-sm">
            tools{" "}
            <span className="text-foreground">{runtimeTurn.toolCallCount}</span>
          </div>
          <div className="text-muted-foreground text-sm">
            memory{" "}
            <span className="text-foreground">{runtimeTurn.memoryCount}</span>
          </div>
          <div className="text-muted-foreground text-sm">
            recall{" "}
            <span className="text-foreground">
              {runtimeTurn.memoryRecallStrategy ?? "--"}
            </span>
          </div>
        </CardContent>
      </Card>

      {runtimeTurn.errorJson ? (
        <JsonPreview
          itemValue="turn-error"
          title="Turn Error"
          value={runtimeTurn.errorJson}
        />
      ) : null}

      <div className="space-y-3">
        {spans.length > 0 ? (
          spans.map((span) => <SpanCard key={span.id} span={span} />)
        ) : (
          <Alert>
            <AlertDescription>
              当前 runtime turn 还没有 spans。
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}

export { TaskRunTracePanel };
