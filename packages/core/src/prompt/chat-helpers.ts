import { compileSystemPrompt, type SystemPromptContext } from "./compile-system-prompt";

type TextLikePart = {
  type?: string;
  content?: string;
};

type TextLikeMessage = {
  role: string;
  content?: string | null | Array<TextLikePart>;
  parts?: Array<TextLikePart>;
};

const buildSystemPrompt = (context: SystemPromptContext) =>
  compileSystemPrompt(context);

const getMessageText = (content: TextLikeMessage["content"]) => {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter((part) => part.type === "text" && typeof part.content === "string")
    .map((part) => part.content)
    .join("");
};

const getLatestUserText = (messages: Array<TextLikeMessage>) =>
  getRecentUserTexts(messages, 1)[0] ?? "";

const getRecentUserTexts = (
  messages: Array<TextLikeMessage>,
  limit = 4,
) =>
  [...messages]
    .reverse()
    .filter((message) => message.role === "user")
    .slice(0, limit)
    .map((message) => getMessageText(message.content) || getMessageText(message.parts))
    .filter((text) => text.length > 0);

const buildMockAssistantReply = (input: {
  systemPrompt: string;
  lastUserMessage: string;
}) =>
  [
    "Buni mock stream is active through TanStack AI.",
    input.lastUserMessage
      ? `Latest user message: ${input.lastUserMessage}`
      : "No user message content was provided.",
    input.systemPrompt
      ? "Agent config has already been folded into the system prompt for this run."
      : "Agent config is currently empty.",
    "Replace this mock adapter with a real provider next, and keep the same SSE route and client hook.",
  ].join("\n\n");

export {
  buildMockAssistantReply,
  buildSystemPrompt,
  getLatestUserText,
  getMessageText,
  getRecentUserTexts,
};
export type { TextLikeMessage, TextLikePart };
