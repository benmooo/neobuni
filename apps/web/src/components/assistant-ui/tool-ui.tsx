import {
  type ReasoningMessagePartProps,
  type ToolCallMessagePartProps,
  useAuiState,
} from "@assistant-ui/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@neobuni/ui/components/collapsible";
import { CaretDown, Sparkle, Wrench } from "@phosphor-icons/react";
import { type PropsWithChildren, useEffect, useState } from "react";

import { DotMatrix } from "./dot-matrix";

interface BuniApproval {
  approved?: boolean;
  id: string;
  needsApproval: boolean;
}

interface BuniToolArtifact {
  approval?: BuniApproval;
  buniResultError?: string;
  buniResultState?: string;
  buniState?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getToolArtifact = (artifact: unknown): BuniToolArtifact | undefined => {
  if (!isRecord(artifact)) {
    return undefined;
  }

  return {
    approval: isRecord(artifact.approval)
      ? {
          id:
            typeof artifact.approval.id === "string"
              ? artifact.approval.id
              : "",
          needsApproval: artifact.approval.needsApproval === true,
          approved:
            typeof artifact.approval.approved === "boolean"
              ? artifact.approval.approved
              : undefined,
        }
      : undefined,
    buniResultError:
      typeof artifact.buniResultError === "string"
        ? artifact.buniResultError
        : undefined,
    buniResultState:
      typeof artifact.buniResultState === "string"
        ? artifact.buniResultState
        : undefined,
    buniState:
      typeof artifact.buniState === "string" ? artifact.buniState : undefined,
  };
};

const maybeParseJson = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (
    !(
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    )
  ) {
    return value;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
};

const formatJson = (value: unknown) => {
  const normalized = maybeParseJson(value);

  try {
    return JSON.stringify(normalized, null, 2) ?? "null";
  } catch {
    return JSON.stringify(String(normalized), null, 2);
  }
};

const stateLabel: Record<string, string> = {
  complete: "已完成",
  error: "失败",
  "input-complete": "参数已完成",
  "input-streaming": "参数流入中",
  "approval-requested": "等待确认",
  "approval-responded": "已确认",
  "awaiting-input": "等待输入",
  running: "执行中",
  streaming: "返回中",
  waiting: "等待执行",
};

const getToolState = (part: ToolCallMessagePartProps) => {
  const artifact = getToolArtifact(part.artifact);

  if (
    artifact?.approval?.needsApproval &&
    artifact.approval.approved === undefined
  ) {
    return "approval-requested";
  }

  if (
    artifact?.buniState === "awaiting-input" ||
    artifact?.buniState === "input-streaming"
  ) {
    return artifact.buniState;
  }

  if (artifact?.buniResultState === "error" || part.isError) {
    return "error";
  }

  if (part.result !== undefined) {
    return artifact?.buniResultState ?? "complete";
  }

  return part.status.type === "running" ? "running" : "waiting";
};

const isRunningState = (state: string) =>
  state === "running" || state === "streaming" || state === "input-streaming";

const truncateText = (value: string, maxLength = 72) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;

const getStringValue = (
  value: Record<string, unknown>,
  keys: readonly string[]
) =>
  keys
    .map((key) => value[key])
    .find((candidate): candidate is string => typeof candidate === "string");

const getToolSummary = (
  part: ToolCallMessagePartProps,
  state: string,
  artifact: BuniToolArtifact | undefined
) => {
  if (artifact?.buniResultError) {
    return artifact.buniResultError;
  }

  if (part.isError) {
    return typeof part.result === "string" ? part.result : stateLabel.error;
  }

  if (part.result === undefined) {
    return stateLabel[state] ?? state;
  }

  const result = maybeParseJson(part.result);

  if (typeof result === "string") {
    return result;
  }

  if (isRecord(result)) {
    return (
      getStringValue(result, [
        "summary",
        "message",
        "title",
        "name",
        "status",
      ]) ??
      stateLabel[state] ??
      state
    );
  }

  return stateLabel[state] ?? state;
};

const useAutoDisclosure = (isRunning: boolean) => {
  const [open, setOpen] = useState(isRunning);

  useEffect(() => {
    setOpen(isRunning);
  }, [isRunning]);

  return [open, setOpen] as const;
};

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="space-y-1">
      <div className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
        {label}
      </div>
      <pre className="max-h-48 overflow-auto bg-muted p-2 font-mono text-[11px] text-foreground leading-4">
        {formatJson(value)}
      </pre>
    </div>
  );
}

function AssistantReasoningPart({ text }: ReasoningMessagePartProps) {
  const content = text.trim();

  if (content.length === 0) {
    return null;
  }

  return (
    <div className="whitespace-pre-wrap text-foreground text-xs leading-5">
      {content}
    </div>
  );
}

function AssistantReasoningGroup({
  children,
  isRunning,
}: PropsWithChildren<{ isRunning: boolean }>) {
  const [open, setOpen] = useAutoDisclosure(isRunning);

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 py-1 text-left text-muted-foreground text-xs hover:text-foreground">
        {isRunning ? (
          <DotMatrix label="正在思考" state="working" />
        ) : (
          <Sparkle size={14} />
        )}
        <span className="flex-1">思考过程</span>
        <CaretDown
          className="transition-transform group-data-[panel-open]:rotate-180"
          size={14}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          aria-busy={isRunning}
          className="max-h-52 space-y-2 overflow-y-auto py-2 pl-6"
        >
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AssistantToolCall(part: ToolCallMessagePartProps) {
  const state = getToolState(part);
  const artifact = getToolArtifact(part.artifact);
  const isRunning = isRunningState(state);
  const [open, setOpen] = useAutoDisclosure(isRunning);
  const hasResult = part.result !== undefined;
  const summary = truncateText(getToolSummary(part, state, artifact));
  const isError = state === "error";

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger className="group/tool-call flex w-full items-center gap-2 py-1 text-left text-muted-foreground text-xs hover:text-foreground">
        {isRunning ? (
          <DotMatrix label="工具执行中" state="working" />
        ) : (
          <Wrench
            className={isError ? "text-destructive" : undefined}
            size={14}
          />
        )}
        <span className="shrink-0 font-mono text-xs">{part.toolName}</span>
        <span
          className={
            isError
              ? "min-w-0 flex-1 truncate text-destructive"
              : "min-w-0 flex-1 truncate"
          }
        >
          {summary}
        </span>
        <CaretDown
          className="shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180"
          size={14}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 py-2 pl-6">
          {artifact?.approval?.needsApproval ? (
            <p className="text-[11px] text-muted-foreground">
              该工具调用需要用户确认后才会继续执行。
            </p>
          ) : null}

          <JsonBlock label="参数" value={part.args ?? part.argsText} />

          {artifact?.buniResultError ? (
            <p className="text-[11px] text-destructive">
              {artifact.buniResultError}
            </p>
          ) : null}

          {hasResult ? <JsonBlock label="结果" value={part.result} /> : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AssistantToolCallGroup({
  children,
  count,
  isRunning,
}: PropsWithChildren<{ count: number; isRunning: boolean }>) {
  const [open, setOpen] = useAutoDisclosure(isRunning);
  const label = `${count} tool ${count === 1 ? "call" : "calls"}`;

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger className="group/tool-group flex w-full items-center gap-2 py-1 text-left text-muted-foreground text-xs hover:text-foreground">
        {isRunning ? (
          <DotMatrix label="工具调用中" state="working" />
        ) : (
          <Wrench size={14} />
        )}
        <span className="flex-1 font-medium">{label}</span>
        <CaretDown
          className="transition-transform group-data-[panel-open]:rotate-180"
          size={14}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-1 py-1 pl-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AssistantWorkingIndicator() {
  const isConnecting = useAuiState(
    (state) =>
      state.message.parts.length === 0 &&
      state.message.status?.type === "running"
  );

  if (!isConnecting) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 py-1 text-muted-foreground text-sm">
      <DotMatrix state="connecting" />
      <span>连接中…</span>
    </div>
  );
}

export {
  AssistantReasoningGroup,
  AssistantReasoningPart,
  AssistantToolCall,
  AssistantToolCallGroup,
  AssistantWorkingIndicator,
};
