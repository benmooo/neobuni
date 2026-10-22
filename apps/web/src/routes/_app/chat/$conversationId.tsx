import type { RendererState } from "@neobuni/contracts";
import { Spinner } from "@neobuni/ui/components/spinner";
import type { UIMessage } from "@tanstack/ai-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AssistantUiRuntimeProvider } from "@/components/assistant-ui/runtime-provider";
import { AssistantUiThread } from "@/components/assistant-ui/thread";
import { ChatHeader } from "@/components/chat/ChatHeader";
import {
  getLatestAssistantUiRenderSpec,
  getMessageRendererState,
} from "@/components/chat/message-render-metadata";
import { RenameDialog } from "@/components/chat/RenameDialog";
import { type DbMessage, usePersistentChat } from "@/hooks/use-persistent-chat";
import { api } from "@/lib/api";

export const Route = createFileRoute("/_app/chat/$conversationId")({
  component: ConversationPage,
});

// ─── Inner chat view — keyed on conversationId so useChat reinitialises ───────

interface ChatViewProps {
  aiName: string;
  avatarUri: string;
  conversationId: string;
  conversationTitle: string;
  initialDbMessages: DbMessage[];
  userName: string;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const getLatestRuntimeRendererState = (
  spans: Array<{ stage: string; output: unknown }>
) => {
  const responseSpecSpan = [...spans]
    .reverse()
    .find((span) => span.stage === "response_spec_build");

  const output = asRecord(responseSpecSpan?.output);
  const rendererState = asRecord(output?.rendererState);

  return rendererState ? (rendererState as RendererState) : null;
};

function ChatView({
  conversationId,
  conversationTitle,
  initialDbMessages,
  aiName,
  avatarUri,
  userName,
}: ChatViewProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [renameOpen, setRenameOpen] = useState(false);
  const showRuntimeInspector = import.meta.env.DEV;
  const { messages, send, isLoading, stop, setMessages, toolProgress } =
    usePersistentChat(conversationId, initialDbMessages);
  const prevIsLoadingRef = useRef(false);

  const runtimeTurnsQuery = useQuery({
    queryKey: ["runtime-turns", conversationId],
    queryFn: async () => api.runtime.listTurns({ conversationId }),
    refetchInterval: (query) => {
      const turns = query.state.data;
      return isLoading || turns?.some((turn) => turn.status === "running")
        ? 1000
        : false;
    },
  });

  const latestTurnId = runtimeTurnsQuery.data?.[0]?.id ?? null;
  const latestTurnSpansQuery = useQuery({
    enabled: latestTurnId !== null,
    queryKey: ["runtime-spans", latestTurnId],
    queryFn: async () =>
      latestTurnId === null
        ? []
        : await api.runtime.listTurnSpans({ turnId: latestTurnId }),
    refetchInterval: isLoading ? 1000 : false,
  });

  const runtimeRendererState = getLatestRuntimeRendererState(
    latestTurnSpansQuery.data ?? []
  );
  const latestUiRenderSpec =
    runtimeRendererState?.ui ?? getLatestAssistantUiRenderSpec([...messages]);

  useEffect(() => {
    const justFinished = prevIsLoadingRef.current && !isLoading;
    if (justFinished) {
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      queryClient.invalidateQueries({
        queryKey: ["runtime-turns", conversationId],
      });
    }
    prevIsLoadingRef.current = isLoading;
  }, [conversationId, isLoading, queryClient]);

  useEffect(() => {
    if (!runtimeRendererState) {
      return;
    }

    const latestAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");

    if (!latestAssistantMessage) {
      return;
    }

    const existingRendererState = getMessageRendererState(
      latestAssistantMessage
    );

    if (
      existingRendererState &&
      JSON.stringify(existingRendererState) ===
        JSON.stringify(runtimeRendererState)
    ) {
      return;
    }

    const nextMessages = messages.map((message) =>
      message.id === latestAssistantMessage.id
        ? ({
            ...message,
            metadata: {
              ...(message as UIMessage & { metadata?: Record<string, unknown> })
                .metadata,
              render: runtimeRendererState,
            },
          } as UIMessage)
        : message
    );

    setMessages(nextMessages);
  }, [messages, runtimeRendererState, setMessages]);

  const handleNew = async () => {
    const now = new Date();
    const title = new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
    }).format(now);
    const created = await api.conversations.create({
      title,
      modelKey: "default",
    });
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    navigate({
      to: "/chat/$conversationId",
      params: { conversationId: created.id },
    });
  };

  return (
    <div className="flex h-screen flex-col">
      <ChatHeader
        aiName={aiName}
        avatarUri={avatarUri}
        conversationId={conversationId}
        onNewConversation={handleNew}
        onOpenRuntimePage={() =>
          navigate({
            to: "/chat/$conversationId/runtime",
            params: { conversationId },
          })
        }
        onRenameConversation={() => setRenameOpen(true)}
        showRuntimeInspector={showRuntimeInspector}
      />

      <AssistantUiRuntimeProvider
        isLoading={isLoading}
        messages={[...messages]}
        onSend={send}
        onStop={stop}
      >
        <AssistantUiThread
          aiName={aiName}
          avatarUri={avatarUri}
          toolProgress={toolProgress}
          uiRenderSpec={latestUiRenderSpec}
          userName={userName}
        />
      </AssistantUiRuntimeProvider>

      <RenameDialog
        conversationId={conversationId}
        currentTitle={conversationTitle}
        onClose={() => setRenameOpen(false)}
        open={renameOpen}
      />
    </div>
  );
}

// ─── Page — loads data, then renders ChatView ─────────────────────────────────

function ConversationPage() {
  const { conversationId } = Route.useParams();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const conversationQuery = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: async () => api.conversations.get({ conversationId }),
  });

  const messagesQuery = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => api.messages.list({ conversationId }),
  });

  const agentQuery = useQuery({
    queryKey: ["agent-config"],
    queryFn: async () => api.config.agent.get(),
  });

  if (messagesQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    );
  }

  if (pathname.endsWith("/runtime")) {
    return <Outlet />;
  }

  return (
    <ChatView
      aiName={agentQuery.data?.aiName ?? "Buni"}
      avatarUri={agentQuery.data?.avatarUri ?? ""}
      conversationId={conversationId}
      conversationTitle={conversationQuery.data?.title ?? ""}
      initialDbMessages={messagesQuery.data ?? []}
      key={conversationId}
      userName={agentQuery.data?.userName ?? "You"}
    />
  );
}
