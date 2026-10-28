import { OPENCODE_DEFAULT_BASE_URL } from "@neobuni/contracts";
import { z } from "zod";

const OPENCODE_CLIENT_NAME = "neobuni";
const OPENCODE_CLIENT_VERSION = "1.0";
const OPENCODE_MODELS_PATH = "/v1/models";
const OPENCODE_OPENAI_PATH_SUFFIX = "/openai/v1";

const userAgent = `${OPENCODE_CLIENT_NAME}/${OPENCODE_CLIENT_VERSION}`;

const openCodeModelListSchema = z.object({
  data: z.array(z.object({ id: z.string().trim().min(1) })),
});

/**
 * Headers OpenCode asks every non-OpenCode client to send:
 * - a real `User-Agent`, so abuse monitoring does not see a generic SDK name;
 * - a stable `x-opencode-session` per conversation, used for routing and prompt
 *   cache hints (see the "Where can I use it?" section of the Go docs).
 */
const buildOpenCodeHeaders = (input: {
  sessionId: string;
}): Record<string, string> => ({
  "User-Agent": userAgent,
  "x-opencode-session": input.sessionId,
});

/**
 * The configured base URL points at a protocol surface
 * (`.../inference/openai/v1`), while the model catalogue lives one level above
 * it at `.../inference/v1/models`.
 */
const resolveOpenCodeModelsUrl = (baseUrl?: string): string => {
  const normalized = (baseUrl?.trim() || OPENCODE_DEFAULT_BASE_URL).replace(
    /\/+$/,
    ""
  );
  const inferenceRoot = normalized.endsWith(OPENCODE_OPENAI_PATH_SUFFIX)
    ? normalized.slice(0, -OPENCODE_OPENAI_PATH_SUFFIX.length)
    : normalized;

  return `${inferenceRoot}${OPENCODE_MODELS_PATH}`;
};

/**
 * The catalogue endpoint is public (no API key required), so this doubles as a
 * cheap liveness probe that never burns Go allowance.
 */
const listOpenCodeModels = async (input?: {
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<string[]> => {
  const response = await fetch(resolveOpenCodeModelsUrl(input?.baseUrl), {
    headers: { "User-Agent": userAgent },
    ...(input?.signal ? { signal: input.signal } : {}),
  });

  if (!response.ok) {
    throw new Error(
      `OpenCode model list request failed (${response.status}): ${await response.text()}`
    );
  }

  const parsed = openCodeModelListSchema.parse(await response.json());

  return [...new Set(parsed.data.map((entry) => entry.id))].sort();
};

export {
  buildOpenCodeHeaders,
  listOpenCodeModels,
  OPENCODE_CLIENT_NAME,
  resolveOpenCodeModelsUrl,
};
