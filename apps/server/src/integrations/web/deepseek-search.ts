import type {
  WebPageResult,
  WebSearchResult,
  WebSearchResultItem,
} from "./types";

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_SEARCH_TIMEOUT_MS = 12_000;
const DEFAULT_FETCH_TIMEOUT_MS = 25_000;
const DEFAULT_SEARCH_COUNT = 10;
const MIN_SEARCH_COUNT = 1;
const MAX_SEARCH_COUNT = 50;

type DeepSeekErrorCode =
  | "blocked"
  | "insufficient_balance"
  | "invalid_input"
  | "not_found"
  | "rate_limited"
  | "timeout"
  | "unauthorized"
  | "upstream";

class DeepSeekSearchError extends Error {
  readonly code: DeepSeekErrorCode;
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(
    code: DeepSeekErrorCode,
    message: string,
    options: { retryable?: boolean; status?: number | null } = {}
  ) {
    super(message);
    this.name = "DeepSeekSearchError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status ?? null;
  }
}

interface DeepSeekSearchConfig {
  apiKey: string;
  baseUrl: string;
}

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

interface DeepSeekDeps {
  fetch: FetchFn;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const asFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asIsoString = (value: unknown): string | null => {
  const text = asString(value);
  if (text === null) {
    return null;
  }

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
};

const normalizeBaseUrl = (value: string | undefined): string => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return DEFAULT_DEEPSEEK_BASE_URL;
  }

  return trimmed.replace(/\/+$/, "");
};

const clampCount = (value: number | undefined): number => {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_SEARCH_COUNT;
  }

  return Math.min(
    MAX_SEARCH_COUNT,
    Math.max(MIN_SEARCH_COUNT, Math.trunc(value))
  );
};

const errorForStatus = (status: number, body: string): DeepSeekSearchError => {
  const detail = body.slice(0, 200);

  if (status === 401) {
    return new DeepSeekSearchError(
      "unauthorized",
      `DeepSeek key rejected (401): ${detail}`,
      { status }
    );
  }

  if (status === 402) {
    return new DeepSeekSearchError(
      "insufficient_balance",
      `DeepSeek balance exhausted (402): ${detail}`,
      { status }
    );
  }

  if (status === 403) {
    return new DeepSeekSearchError(
      "blocked",
      `DeepSeek refused the request (403): ${detail}`,
      { status }
    );
  }

  if (status === 404) {
    return new DeepSeekSearchError(
      "not_found",
      `DeepSeek returned no usable content (404): ${detail}`,
      { status }
    );
  }

  if (status === 429) {
    return new DeepSeekSearchError(
      "rate_limited",
      `DeepSeek rate limited the request (429): ${detail}`,
      { retryable: true, status }
    );
  }

  if (status === 400 || status === 413) {
    return new DeepSeekSearchError(
      "invalid_input",
      `DeepSeek rejected the request (${status}): ${detail}`,
      { status }
    );
  }

  return new DeepSeekSearchError(
    "upstream",
    `DeepSeek request failed (${status}): ${detail}`,
    { retryable: status >= 500 || status === 408, status }
  );
};

const mapSearchItems = (results: unknown): WebSearchResultItem[] =>
  asArray(results).flatMap((entry, index) => {
    const item = asRecord(entry);
    const title = asString(item.title);
    const url = asString(item.url);

    if (title === null || url === null) {
      return [];
    }

    return [
      {
        authority: asFiniteNumber(item.authority),
        publishedAt: asIsoString(item.date),
        rank: index + 1,
        rerankScore: asFiniteNumber(item.rerank_score),
        snippet: asString(item.snippet),
        sourceName: asString(item.site_name),
        summary: asString(item.summary),
        title,
        url,
      },
    ];
  });

const postJson = async <TResponse>(input: {
  body: Record<string, unknown>;
  config: DeepSeekSearchConfig;
  deps: DeepSeekDeps;
  path: string;
  signal?: AbortSignal;
  timeoutMs: number;
}): Promise<TResponse> => {
  if (input.config.apiKey.length === 0) {
    throw new DeepSeekSearchError(
      "unauthorized",
      "DeepSeek API key is not configured."
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error("DeepSeek request timed out."));
  }, input.timeoutMs);
  const abortFromParent = () => controller.abort(input.signal?.reason);

  if (input.signal) {
    if (input.signal.aborted) {
      controller.abort(input.signal.reason);
    } else {
      input.signal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  try {
    const response = await input.deps.fetch(
      `${input.config.baseUrl}${input.path}`,
      {
        body: JSON.stringify(input.body),
        headers: {
          Authorization: `Bearer ${input.config.apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw errorForStatus(response.status, await response.text());
    }

    return (await response.json()) as TResponse;
  } catch (error) {
    if (error instanceof DeepSeekSearchError) {
      throw error;
    }

    if (controller.signal.aborted) {
      throw new DeepSeekSearchError("timeout", "DeepSeek request timed out.", {
        retryable: true,
      });
    }

    throw new DeepSeekSearchError(
      "upstream",
      error instanceof Error ? error.message : "DeepSeek request failed.",
      { retryable: true }
    );
  } finally {
    clearTimeout(timeoutId);
    input.signal?.removeEventListener("abort", abortFromParent);
  }
};

const searchDeepSeek = async (input: {
  apiKey: string;
  baseUrl?: string;
  count?: number;
  needContent?: boolean;
  oriQuestion?: string;
  query: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  deps?: Partial<DeepSeekDeps>;
}): Promise<WebSearchResult<"deepseek">> => {
  const payload = await postJson<{ results?: unknown }>({
    body: {
      count: clampCount(input.count),
      ...(input.needContent ? { need_content: true } : {}),
      ...(input.oriQuestion ? { ori_question: input.oriQuestion } : {}),
      query: input.query,
    },
    config: {
      apiKey: input.apiKey,
      baseUrl: normalizeBaseUrl(input.baseUrl),
    },
    deps: { fetch, ...input.deps },
    path: "/v1/tools/search",
    signal: input.signal,
    timeoutMs: input.timeoutMs ?? DEFAULT_SEARCH_TIMEOUT_MS,
  });

  return {
    items: mapSearchItems(asRecord(payload).results),
    provider: "deepseek",
    query: input.query,
  };
};

const fetchDeepSeekPage = async (input: {
  apiKey: string;
  baseUrl?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  url: string;
  deps?: Partial<DeepSeekDeps>;
}): Promise<WebPageResult<"deepseek">> => {
  const payload = await postJson<{ content?: unknown; title?: unknown }>({
    body: { url: input.url },
    config: {
      apiKey: input.apiKey,
      baseUrl: normalizeBaseUrl(input.baseUrl),
    },
    deps: { fetch, ...input.deps },
    path: "/v1/tools/fetch",
    signal: input.signal,
    timeoutMs: input.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS,
  });

  const title = asString(asRecord(payload).title);
  const markdown = typeof payload.content === "string" ? payload.content : "";

  if (markdown.trim().length === 0) {
    throw new DeepSeekSearchError(
      "not_found",
      "DeepSeek returned an empty page body."
    );
  }

  return {
    document: {
      byline: null,
      excerpt: null,
      extractionMethod: "provider",
      fetchedAt: new Date().toISOString(),
      finalUrl: input.url,
      language: null,
      markdown,
      plainText: markdown,
      publishedAt: null,
      siteName: null,
      statusCode: 200,
      title,
      url: input.url,
      warnings: [],
    },
    provider: "deepseek",
  };
};

export type { DeepSeekDeps, DeepSeekErrorCode, DeepSeekSearchConfig, FetchFn };
export {
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_SEARCH_TIMEOUT_MS,
  DeepSeekSearchError,
  errorForStatus,
  fetchDeepSeekPage,
  mapSearchItems,
  normalizeBaseUrl,
  searchDeepSeek,
};
