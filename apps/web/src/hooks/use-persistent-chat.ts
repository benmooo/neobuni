import { expandPersistedMessagesToHydratedUiMessages } from "@neobuni/contracts";
import type { UIMessage } from "@tanstack/ai-react";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { useEffect, useState } from "react";

import { apiBaseUrl } from "../lib/api";

interface DbMessage {
  content: string;
  createdAt: string;
  id: string;
  metadata?: Record<string, unknown>;
  role: "user" | "assistant" | "system" | "tool";
}

const dbMessageToUIMessage = (msg: DbMessage): UIMessage =>
  ({
    id: msg.id,
    role: msg.role,
    parts: [{ type: "text", content: msg.content }],
    metadata: msg.metadata ?? {},
    createdAt: new Date(msg.createdAt),
  }) as UIMessage;

const dbMessagesToUIMessages = (messages: DbMessage[]): UIMessage[] =>
  expandPersistedMessagesToHydratedUiMessages(
    messages
  ) as unknown as UIMessage[];

const getClientTimezone = () => {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return typeof timezone === "string" && timezone.trim().length > 0
    ? timezone
    : undefined;
};

function usePersistentChat(
  conversationId: string,
  initialDbMessages: DbMessage[]
) {
  const initialMessages = dbMessagesToUIMessages(initialDbMessages);
  const [toolProgress, setToolProgress] = useState<string | null>(null);

  const {
    messages,
    sendMessage,
    isLoading,
    status,
    stop,
    clear,
    error,
    setMessages,
  } = useChat({
    threadId: conversationId,
    forwardedProps: {
      conversationId,
      timezone: getClientTimezone(),
    },
    connection: fetchServerSentEvents(`${apiBaseUrl}/v1/chat/stream`, {
      credentials: "include",
    }),
    initialMessages,
    onCustomEvent: (eventType: string) => {
      if (/^tool\..+\.progress$/.test(eventType)) {
        setToolProgress("报告生成中…");
      }
    },
  });

  useEffect(() => {
    if (!isLoading) {
      setToolProgress(null);
    }
  }, [isLoading]);

  const send = async (content: string) => {
    await sendMessage(content);
  };

  return {
    messages,
    send,
    isLoading,
    status,
    stop,
    clear,
    setMessages,
    error,
    toolProgress,
  };
}

export type { DbMessage };
export { dbMessagesToUIMessages, dbMessageToUIMessage, usePersistentChat };
