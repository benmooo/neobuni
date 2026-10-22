import type { WebExtractResult, WebPageResult, WebSearchResult } from "./types";

interface WebclawConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
}

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

interface WebclawDeps {
  fetch: FetchFn;
}

const DEFAULT_WEBCLAW_BASE_URL = "https://api.webclaw.io";
const DEFAULT_WEB_TIMEOUT_MS = 10_000;

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");

const toPositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const asString = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const asIsoString = (value: unknown) => {
  const text = asString(value);
  return text && !Number.isNaN(Date.parse(text))
    ? new Date(text).toISOString()
    : null;
};

const readWebclawConfig = (): WebclawConfig => ({
  apiKey: process.env.NEOBUNI_WEBCLAW_API_KEY?.trim() ?? "",
  baseUrl: normalizeBaseUrl(
    process.env.NEOBUNI_WEBCLAW_BASE_URL?.trim() || DEFAULT_WEBCLAW_BASE_URL
  ),
  timeoutMs: toPositiveInt(
    process.env.NEOBUNI_WEB_TIMEOUT_MS,
    DEFAULT_WEB_TIMEOUT_MS
  ),
});

const buildFetchSignal = (input: {
  timeoutMs: number;
  signal?: AbortSignal;
}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error("Webclaw request timed out."));
  }, input.timeoutMs);

  const abortFromParent = () => {
    controller.abort(input.signal?.reason);
  };

  if (input.signal) {
    if (input.signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort(input.signal.reason);
    } else {
      input.signal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  const cleanup = () => {
    clearTimeout(timeoutId);
    if (input.signal) {
      input.signal.removeEventListener("abort", abortFromParent);
    }
  };

  return {
    signal: controller.signal,
    cleanup,
  };
};

const fetchWebclawJson = async <TResponse>(input: {
  path: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
  config?: WebclawConfig;
  deps?: Partial<WebclawDeps>;
}): Promise<{
  data: TResponse;
  statusCode: number;
}> => {
  const config = input.config ?? readWebclawConfig();

  if (config.apiKey.length === 0) {
    throw new Error("Webclaw API key is not configured.");
  }

  const deps = {
    fetch,
    ...input.deps,
  };
  const request = buildFetchSignal({
    timeoutMs: config.timeoutMs,
    signal: input.signal,
  });

  try {
    const response = await deps.fetch(`${config.baseUrl}${input.path}`, {
      method: "POST",
      signal: request.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input.body),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Webclaw request failed (${response.status}): ${body.slice(0, 240)}`
      );
    }

    return {
      data: (await response.json()) as TResponse,
      statusCode: response.status,
    };
  } finally {
    request.cleanup();
  }
};

const fetchWebclawPage = async (input: {
  url: string;
  signal?: AbortSignal;
  config?: WebclawConfig;
  deps?: Partial<WebclawDeps>;
}): Promise<WebPageResult> => {
  const response = await fetchWebclawJson<{
    url?: unknown;
    metadata?: unknown;
    markdown?: unknown;
    text?: unknown;
  }>({
    path: "/v1/scrape",
    body: {
      url: input.url,
      formats: ["markdown", "text"],
      only_main_content: true,
    },
    signal: input.signal,
    config: input.config,
    deps: input.deps,
  });
  const payload = asRecord(response.data);
  const metadata = asRecord(payload.metadata);
  const markdown = asString(payload.markdown) ?? "";
  const plainText = asString(payload.text) ?? markdown;

  return {
    provider: "webclaw",
    document: {
      url: input.url,
      finalUrl: asString(payload.url) ?? input.url,
      title: asString(metadata.title),
      siteName: asString(metadata.site_name),
      byline: asString(metadata.author),
      publishedAt: asIsoString(metadata.published_date),
      language: asString(metadata.language),
      excerpt: asString(metadata.description),
      markdown,
      plainText,
      statusCode: response.statusCode,
      extractionMethod: "provider",
      warnings:
        markdown.length > 0 || plainText.length > 0 ? [] : ["empty_content"],
      fetchedAt: new Date().toISOString(),
    },
  };
};

const fetchWebclawExtract = async (input: {
  url: string;
  instruction: string;
  schema?: Record<string, unknown>;
  signal?: AbortSignal;
  config?: WebclawConfig;
  deps?: Partial<WebclawDeps>;
}): Promise<WebExtractResult> => {
  const response = await fetchWebclawJson<{
    data?: unknown;
    generated_schema?: unknown;
  }>({
    path: "/v1/extract",
    body: {
      url: input.url,
      prompt: input.instruction,
      ...(input.schema ? { schema: input.schema } : {}),
    },
    signal: input.signal,
    config: input.config,
    deps: input.deps,
  });
  const payload = asRecord(response.data);
  const generatedSchema = asRecord(payload.generated_schema);

  return {
    provider: "webclaw",
    data: payload.data ?? null,
    generatedSchema:
      Object.keys(generatedSchema).length > 0 ? generatedSchema : null,
  };
};

const fetchWebclawSearch = async (input: {
  query: string;
  limit: number;
  signal?: AbortSignal;
  config?: WebclawConfig;
  deps?: Partial<WebclawDeps>;
}): Promise<WebSearchResult> => {
  const fetchSearchResponse = (resultLimitField: "num_results" | "num") =>
    fetchWebclawJson<{
      results?: unknown;
    }>({
      path: "/v1/search",
      body: {
        query: input.query,
        [resultLimitField]: input.limit,
        scrape: false,
      },
      signal: input.signal,
      config: input.config,
      deps: input.deps,
    });
  const response = await fetchSearchResponse("num_results").catch((error) => {
    if (error instanceof Error && error.message.includes("num_results")) {
      return fetchSearchResponse("num");
    }

    throw error;
  });
  const payload = asRecord(response.data);
  const items = asArray(payload.results).flatMap((item, index) => {
    const record = asRecord(item);
    const title = asString(record.title);
    const url = asString(record.url);

    if (title === null || url === null) {
      return [];
    }

    return [
      {
        rank:
          typeof record.position === "number" &&
          Number.isInteger(record.position) &&
          record.position > 0
            ? record.position
            : index + 1,
        title,
        url,
        snippet: asString(record.snippet),
        sourceName: asString(record.source_name) ?? asString(record.source),
        publishedAt:
          asIsoString(record.published_at) ?? asIsoString(record.publishedAt),
      },
    ];
  });

  return {
    provider: "webclaw",
    query: input.query,
    items,
  };
};

export type { WebclawConfig, WebclawDeps };
export {
  DEFAULT_WEB_TIMEOUT_MS,
  DEFAULT_WEBCLAW_BASE_URL,
  fetchWebclawExtract,
  fetchWebclawPage,
  fetchWebclawSearch,
  readWebclawConfig,
};
