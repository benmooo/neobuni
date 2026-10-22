import {
  createChatCompletion,
  type OpenAICompatibleConfig,
} from "../providers/openai-compatible-client";

interface ExtractedMemory {
  content: string;
  importance: number;
  keywords: string[];
  type: "event" | "thought" | "preference" | "fact" | "task";
  unresolved: boolean;
}

interface InstantDigestResult {
  keywords: string[];
  shouldRecall: boolean;
}

const EXTRACT_PROMPT = `You are a memory extraction assistant. Analyze the conversation below and extract important memories.

For each memory, provide:
- content: A concise summary (1-2 sentences)
- type: One of "event", "thought", "preference", "fact", "task"
- keywords: Up to 5 relevant keywords
- importance: A score from 0 to 1 (0.7+ for significant events/preferences, 0.3-0.6 for casual mentions)
- unresolved: true if this is a pending plan/question/task that needs follow-up

Return a JSON array of memories. If no significant memories found, return an empty array.
Only extract genuinely important information worth remembering long-term.
Return valid JSON only, with no markdown fences or extra prose.`;

const INSTANT_DIGEST_PROMPT = `You are a memory router. Given a user message, decide if we should search the user's long-term memory for relevant context.

Return JSON: { "shouldRecall": boolean, "keywords": string[] }

Say shouldRecall=true when the user:
- References past events ("remember when...", "last time...", "之前", "上次")
- Asks about their own preferences, plans, or history
- Mentions topics that likely have prior context

Say shouldRecall=false for:
- Casual greetings or small talk
- Questions about general knowledge (not personal)
- Commands or requests with no personal context needed

Return valid JSON only, with no markdown fences or extra prose.`;

const parseJson = <T>(text: string, fallback: T): T => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};

const extractMemories = async (
  config: OpenAICompatibleConfig,
  messagesText: string
): Promise<ExtractedMemory[]> => {
  const text = await createChatCompletion(config, [
    {
      role: "system",
      content: EXTRACT_PROMPT,
    },
    {
      role: "user",
      content: messagesText,
    },
  ]);

  const parsed = parseJson<unknown>(text, []);
  return Array.isArray(parsed) ? (parsed as ExtractedMemory[]) : [];
};

const runInstantDigestLLM = async (
  config: OpenAICompatibleConfig,
  userMessage: string
): Promise<InstantDigestResult> => {
  const text = await createChatCompletion(config, [
    {
      role: "system",
      content: INSTANT_DIGEST_PROMPT,
    },
    {
      role: "user",
      content: userMessage,
    },
  ]);

  const parsed = parseJson<{
    shouldRecall?: unknown;
    keywords?: unknown;
  }>(text, {});

  return {
    shouldRecall: Boolean(parsed.shouldRecall),
    keywords: Array.isArray(parsed.keywords)
      ? parsed.keywords.filter(
          (value): value is string => typeof value === "string"
        )
      : [],
  };
};

export type { ExtractedMemory, InstantDigestResult, OpenAICompatibleConfig };
export { extractMemories, runInstantDigestLLM };
