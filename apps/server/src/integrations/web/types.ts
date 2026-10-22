type WebProviderName = "webclaw";

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

interface WebPageResult {
  document: WebPageDocument;
  provider: WebProviderName;
}

interface WebSearchResultItem {
  publishedAt: string | null;
  rank: number;
  snippet: string | null;
  sourceName: string | null;
  title: string;
  url: string;
}

interface WebSearchResult {
  items: WebSearchResultItem[];
  provider: WebProviderName;
  query: string;
}

interface WebExtractResult {
  data: unknown;
  generatedSchema: Record<string, unknown> | null;
  provider: WebProviderName;
}

export type {
  WebExtractResult,
  WebPageDocument,
  WebPageResult,
  WebProviderName,
  WebSearchResult,
  WebSearchResultItem,
};
