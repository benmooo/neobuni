import type { ThreadMessageLike } from "@assistant-ui/react";
import type { UIMessage } from "@tanstack/ai-react";
import type {
  ReadonlyJSONObject,
  ReadonlyJSONValue,
} from "assistant-stream/utils";

import { getMessageRendererState } from "@/components/chat/message-render-metadata";

interface ToolResultSnapshot {
  error?: string;
  state: string;
  value: unknown;
}

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

type ThreadMessageContentPart = Exclude<
  ThreadMessageLike["content"],
  string
>[number];

type UiMessagePart = UIMessage["parts"][number];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isToolActivityPart = (part: UiMessagePart) =>
  part.type === "tool-call" || part.type === "tool-result";

const isToolOnlyAssistantMessage = (message: UIMessage) =>
  message.role === "assistant" &&
  message.parts.length > 0 &&
  message.parts.every(isToolActivityPart);

const mergeToolOnlyAssistantMessages = (
  previous: UIMessage,
  next: UIMessage
): UIMessage => ({
  ...previous,
  parts: [...previous.parts, ...next.parts],
});

const groupConsecutiveToolOnlyUiMessages = (
  messages: readonly UIMessage[]
): UIMessage[] => {
  const groupedMessages: UIMessage[] = [];

  for (const message of messages) {
    const previousMessage = groupedMessages.at(-1);

    if (
      previousMessage !== undefined &&
      isToolOnlyAssistantMessage(previousMessage) &&
      isToolOnlyAssistantMessage(message)
    ) {
      groupedMessages[groupedMessages.length - 1] =
        mergeToolOnlyAssistantMessages(previousMessage, message);
      continue;
    }

    groupedMessages.push(message);
  }

  return groupedMessages;
};

const isReadonlyJsonValue = (value: unknown): value is ReadonlyJSONValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isReadonlyJsonValue);
  }

  if (isRecord(value)) {
    return Object.values(value).every(isReadonlyJsonValue);
  }

  return false;
};

const toReadonlyJsonObject = (
  value: unknown
): ReadonlyJSONObject | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  return isReadonlyJsonValue(value) ? (value as ReadonlyJSONObject) : undefined;
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

const normalizeToolArgs = (
  input: unknown,
  argumentsText: string
): ReadonlyJSONObject | undefined => {
  const normalizedInput = toReadonlyJsonObject(input);

  if (normalizedInput) {
    return normalizedInput;
  }

  const parsedArguments = maybeParseJson(argumentsText);
  return toReadonlyJsonObject(parsedArguments);
};

const normalizeRole = (role: UIMessage["role"]) => {
  if (role === "user" || role === "system") {
    return role;
  }

  return "assistant" as const;
};

const createToolResultMap = (parts: UIMessage["parts"]) =>
  parts.reduce((map, part) => {
    if (part.type !== "tool-result") {
      return map;
    }

    map.set(part.toolCallId, {
      error: part.error,
      state: part.state,
      value: maybeParseJson(part.content),
    });

    return map;
  }, new Map<string, ToolResultSnapshot>());

const createTextContentPart = (text: string): ThreadMessageContentPart => ({
  type: "text",
  text,
});

const createReasoningContentPart = (
  text: string
): ThreadMessageContentPart => ({
  type: "reasoning",
  text,
});

const createDataContentPart = (data: unknown): ThreadMessageContentPart => ({
  type: "data-structured-output",
  data,
});

const createToolCallContentPart = (
  part: Extract<UIMessage["parts"][number], { type: "tool-call" }>,
  result?: ToolResultSnapshot
): ThreadMessageContentPart => ({
  type: "tool-call",
  toolCallId: part.id,
  toolName: part.name,
  args: normalizeToolArgs(part.input, part.arguments),
  argsText: part.arguments,
  artifact: {
    approval: part.approval as BuniApproval | undefined,
    buniState: part.state,
    ...(result
      ? {
          buniResultState: result.state,
          buniResultError: result.error,
        }
      : {}),
  } satisfies BuniToolArtifact,
  ...(result
    ? {
        result: result.value,
        isError: result.state === "error",
      }
    : part.output === undefined
      ? {}
      : {
          result: part.output,
        }),
});

const convertAssistantContent = (
  message: UIMessage
): ThreadMessageLike["content"] => {
  const toolResults = createToolResultMap(message.parts);

  const content = message.parts.flatMap<ThreadMessageContentPart>((part) => {
    if (part.type === "tool-result") {
      return [];
    }

    if (part.type === "text") {
      const text = part.content.trim();

      return text.length > 0 ? [createTextContentPart(text)] : [];
    }

    if (part.type === "thinking") {
      const text = part.content.trim();

      return text.length > 0 ? [createReasoningContentPart(text)] : [];
    }

    if (part.type === "tool-call") {
      const result = toolResults.get(part.id);

      return [createToolCallContentPart(part, result)];
    }

    if (part.type === "structured-output") {
      return [createDataContentPart(part.data)];
    }

    return [];
  });

  return content;
};

const convertUserContent = (message: UIMessage): ThreadMessageLike["content"] =>
  message.parts.flatMap<ThreadMessageContentPart>((part) => {
    if (part.type !== "text") {
      return [];
    }

    const text = part.content.trim();

    return text.length > 0 ? [createTextContentPart(text)] : [];
  });

const convertUiMessageToThreadMessageLike = (
  message: UIMessage
): ThreadMessageLike => {
  const role = normalizeRole(message.role);
  const rendererState = getMessageRendererState(message);
  const content =
    role === "assistant"
      ? convertAssistantContent(message)
      : convertUserContent(message);

  return {
    id: message.id,
    role,
    content,
    ...(message.createdAt ? { createdAt: message.createdAt } : {}),
    ...(rendererState
      ? {
          metadata: {
            custom: {
              render: rendererState,
            },
          },
        }
      : {}),
  };
};

export {
  convertUiMessageToThreadMessageLike,
  groupConsecutiveToolOnlyUiMessages,
};
