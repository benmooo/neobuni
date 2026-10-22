import {
  AuiIf,
  groupPartByType,
  MessagePrimitive,
  type TextMessagePartProps,
  ThreadPrimitive,
  useAuiState,
  useThreadViewport,
  useThreadViewportStore,
} from "@assistant-ui/react";
import type { UiRenderSpec } from "@neobuni/contracts";
import { Alert, AlertDescription } from "@neobuni/ui/components/alert";
import { Avatar, AvatarFallback } from "@neobuni/ui/components/avatar";
import { Button } from "@neobuni/ui/components/button";
import { Card, CardContent } from "@neobuni/ui/components/card";
import { cn } from "@neobuni/ui/lib/utils";
import { ArrowDownIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { BuniAvatar } from "@/components/chat/BuniAvatar";

import { AssistantUiComposer } from "./composer";
import { DotMatrix } from "./dot-matrix";
import { AssistantStreamdownText } from "./streamdown-text";
import {
  AssistantReasoningGroup,
  AssistantReasoningPart,
  AssistantToolCall,
  AssistantToolCallGroup,
  AssistantWorkingIndicator,
} from "./tool-ui";

interface Props {
  aiName: string;
  avatarUri: string;
  toolProgress?: string | null;
  uiRenderSpec?: UiRenderSpec | null;
  userName: string;
}

function UserTextPart({ text }: TextMessagePartProps) {
  const content = text.trim();

  if (content.length === 0) {
    return null;
  }

  return <span className="whitespace-pre-wrap break-words">{content}</span>;
}

const getUserAvatarFallback = (userName: string) =>
  userName.trim().length > 0 ? userName.trim()[0] : "U";

const latestMessageSelector = "[data-message-id]";
const latestMessageVisibilityTolerance = 1;

const getLatestMessageElement = (viewport: HTMLElement) =>
  Array.from(viewport.querySelectorAll<HTMLElement>(latestMessageSelector)).at(
    -1
  ) ?? null;

const isFullyVisibleInViewport = (
  messageBounds: Pick<DOMRectReadOnly, "top" | "bottom">,
  viewportBounds: Pick<DOMRectReadOnly, "top" | "bottom">
) =>
  messageBounds.top >= viewportBounds.top - latestMessageVisibilityTolerance &&
  messageBounds.bottom <=
    viewportBounds.bottom + latestMessageVisibilityTolerance;

function UserMessage({ userName }: Pick<Props, "userName">) {
  return (
    <MessagePrimitive.Root className="flex items-start justify-end gap-3 px-4 py-1">
      <Card
        className="max-w-[80%] bg-primary text-primary-foreground"
        size="sm"
      >
        <CardContent className="text-sm leading-relaxed">
          <MessagePrimitive.Parts
            components={{
              Text: UserTextPart,
            }}
          />
        </CardContent>
      </Card>

      <Avatar className="mt-1">
        <AvatarFallback className="rounded-xl font-semibold text-xs">
          {getUserAvatarFallback(userName)}
        </AvatarFallback>
      </Avatar>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage({
  aiName,
  avatarUri,
}: Pick<Props, "aiName" | "avatarUri">) {
  return (
    <MessagePrimitive.Root className="flex items-start gap-3 px-4 py-1">
      <BuniAvatar
        aiName={aiName}
        avatarUri={avatarUri}
        className="mt-1 rounded-xl"
        fallbackClassName="rounded-xl"
        imageClassName="rounded-xl"
      />

      <Card className="min-w-0 max-w-[82%]" size="sm">
        <CardContent className="flex flex-col gap-2 text-sm">
          <MessagePrimitive.GroupedParts
            groupBy={groupPartByType({
              reasoning: ["group-chain-of-thought", "group-reasoning"],
              "tool-call": ["group-chain-of-thought", "group-tool"],
            })}
          >
            {({ part, children }) => {
              switch (part.type) {
                case "group-chain-of-thought":
                  return <div className="flex flex-col gap-2">{children}</div>;
                case "group-reasoning":
                  return (
                    <AssistantReasoningGroup
                      isRunning={part.status.type === "running"}
                    >
                      {children}
                    </AssistantReasoningGroup>
                  );
                case "group-tool":
                  return (
                    <AssistantToolCallGroup
                      count={part.indices.length}
                      isRunning={part.status.type === "running"}
                    >
                      {children}
                    </AssistantToolCallGroup>
                  );
                case "text":
                  return <AssistantStreamdownText {...part} />;
                case "reasoning":
                  return <AssistantReasoningPart {...part} />;
                case "tool-call":
                  return <AssistantToolCall {...part} />;
                case "data":
                  return part.dataRendererUI;
                default:
                  return null;
              }
            }}
          </MessagePrimitive.GroupedParts>
          <AssistantWorkingIndicator />
        </CardContent>
      </Card>
    </MessagePrimitive.Root>
  );
}

function SystemMessage() {
  return (
    <MessagePrimitive.Root className="px-4 py-1">
      <Alert className="mx-auto max-w-[90%]">
        <AlertDescription className="text-center text-xs">
          <MessagePrimitive.Parts
            components={{
              Text: UserTextPart,
            }}
          />
        </AlertDescription>
      </Alert>
    </MessagePrimitive.Root>
  );
}

function ThreadWelcome({ aiName }: Pick<Props, "aiName">) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-6 py-10 text-center">
      <h2 className="font-semibold text-foreground text-xl">{aiName}</h2>
      <p className="text-muted-foreground text-sm leading-6">
        告诉我你想完成什么。我可以帮你整理信息、制定计划、执行工具操作，或一起把问题想清楚。
      </p>
    </div>
  );
}

function ScrollToLatestMessage() {
  const latestMessageId = useAuiState(
    (state) => state.thread.messages.at(-1)?.id ?? null
  );
  const viewport = useThreadViewport((state) => state.element.viewport);
  const footerHeight = useThreadViewport((state) => state.height.inset);
  const threadViewportStore = useThreadViewportStore();
  const [latestMessageVisibility, setLatestMessageVisibility] = useState({
    messageId: null as string | null,
    isFullyVisible: true,
  });

  useEffect(() => {
    if (!(viewport && latestMessageId)) {
      return;
    }

    const latestMessage = getLatestMessageElement(viewport);

    if (!latestMessage) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setLatestMessageVisibility({
          messageId: latestMessageId,
          isFullyVisible:
            !entry?.rootBounds ||
            isFullyVisibleInViewport(
              entry.boundingClientRect,
              entry.rootBounds
            ),
        });
      },
      {
        root: viewport,
        rootMargin: `0px 0px -${footerHeight}px 0px`,
        threshold: [0, 1],
      }
    );

    observer.observe(latestMessage);
    return () => observer.disconnect();
  }, [footerHeight, latestMessageId, viewport]);

  const isLatestMessageFullyVisible =
    latestMessageVisibility.messageId !== latestMessageId ||
    latestMessageVisibility.isFullyVisible;

  if (isLatestMessageFullyVisible) {
    return null;
  }

  return (
    <Button
      className="absolute -top-12 left-1/2 -translate-x-1/2 rounded-full"
      onClick={() => threadViewportStore.getState().scrollToBottom()}
      size="icon-sm"
      type="button"
      variant="outline"
    >
      <ArrowDownIcon size={16} />
    </Button>
  );
}

function AssistantUiThread({
  aiName,
  avatarUri,
  userName,
  uiRenderSpec = null,
  toolProgress = null,
}: Props) {
  const isEmpty = useAuiState((state) => state.thread.isEmpty);

  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
      <ThreadPrimitive.Viewport className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div
          className={cn(
            "mx-auto flex w-full max-w-4xl flex-1 flex-col px-4",
            isEmpty && "justify-center"
          )}
        >
          <AuiIf condition={(state) => state.thread.isEmpty}>
            <ThreadWelcome aiName={aiName} />
          </AuiIf>

          <div className="mb-4 flex flex-col gap-2 empty:hidden">
            <ThreadPrimitive.Messages>
              {({ message }) => {
                if (message.role === "user") {
                  return <UserMessage userName={userName} />;
                }

                if (message.role === "system") {
                  return <SystemMessage />;
                }

                return (
                  <AssistantMessage aiName={aiName} avatarUri={avatarUri} />
                );
              }}
            </ThreadPrimitive.Messages>
          </div>

          {toolProgress && (
            <div className="flex items-center gap-2 px-4 py-2 text-muted-foreground text-sm">
              <DotMatrix state="working" />
              <span>{toolProgress}</span>
            </div>
          )}

          <ThreadPrimitive.ViewportFooter
            className={cn(
              "z-10 flex flex-col bg-background pb-4",
              !isEmpty && "sticky bottom-0 mt-auto"
            )}
          >
            <div className="pointer-events-auto relative">
              <ScrollToLatestMessage />

              <AssistantUiComposer uiRenderSpec={uiRenderSpec} />
            </div>
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

export { AssistantUiThread };
