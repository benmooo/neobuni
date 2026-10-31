type WebProviderName = "deepseek" | "webclaw";

interface WebPageDocument {
  byline: string | null;
  excerpt: string | null;
  extractionMethod: "reader" | "rendered" | "provider";
  fetchedAt: string;
  finalUrl: string;
  language: string | null;
  markdown: string;
  plainText: string;
  publishedAt: string | null;
  siteName: string | null;
  statusCode: number | null;
  title: string | null;
  url: string;
  warnings: string[];
}

interface WebPageResult<TProvider extends WebProviderName = "webclaw"> {
  document: WebPageDocument;
  provider: TProvider;
}

interface WebSearchResultItem {
  authority: number | null;
  publishedAt: string | null;
  rank: number;
  rerankScore: number | null;
  snippet: string | null;
  sourceName: string | null;
  summary: string | null;
  title: string;
  url: string;
}

interface WebSearchResult<TProvider extends WebProviderName = "webclaw"> {
  items: WebSearchResultItem[];
  provider: TProvider;
  query: string;
}

interface WebExtractResult<TProvider extends WebProviderName = "webclaw"> {
  data: unknown;
  generatedSchema: Record<string, unknown> | null;
  provider: TProvider;
}

export type {
  WebExtractResult,
  WebPageDocument,
  WebPageResult,
  WebProviderName,
  WebSearchResult,
  WebSearchResultItem,
};
