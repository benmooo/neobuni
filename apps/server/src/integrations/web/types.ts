type WebProviderName = "webclaw";

type WebPageDocument = {
	url: string;
	finalUrl: string;
	title: string | null;
	siteName: string | null;
	byline: string | null;
	publishedAt: string | null;
	language: string | null;
	excerpt: string | null;
	markdown: string;
	plainText: string;
	statusCode: number | null;
	extractionMethod: "reader" | "rendered" | "provider";
	warnings: string[];
	fetchedAt: string;
};

type WebPageResult = {
	provider: WebProviderName;
	document: WebPageDocument;
};

type WebSearchResultItem = {
	rank: number;
	title: string;
	url: string;
	snippet: string | null;
	sourceName: string | null;
	publishedAt: string | null;
};

type WebSearchResult = {
	provider: WebProviderName;
	query: string;
	items: WebSearchResultItem[];
};

type WebExtractResult = {
	provider: WebProviderName;
	data: unknown;
	generatedSchema: Record<string, unknown> | null;
};

export type {
	WebExtractResult,
	WebPageDocument,
	WebPageResult,
	WebProviderName,
	WebSearchResult,
	WebSearchResultItem,
};
