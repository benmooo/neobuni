type WebProviderName = "deepseek";

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

interface WebPageResult<TProvider extends WebProviderName = "deepseek"> {
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

interface WebSearchResult<TProvider extends WebProviderName = "deepseek"> {
  items: WebSearchResultItem[];
  provider: TProvider;
  query: string;
}

export type {
  WebPageDocument,
  WebPageResult,
  WebProviderName,
  WebSearchResult,
  WebSearchResultItem,
};
