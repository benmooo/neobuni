import type { NewsHeadline, NewsSourceId } from "@neobuni/contracts";

import { getNewsSourceById, getNewsSourceDisplayName } from "./newsnow-catalog";

type NewsNowConfig = {
	baseUrl: string;
	timeoutMs: number;
};

type NewsNowFetchDeps = {
	fetch: typeof fetch;
};

type NewsNowSourcePayload = {
	provider: "newsnow";
	sourceId: NewsSourceId;
	sourceName: string;
	updatedTime: string | null;
	items: NewsHeadline[];
};

const DEFAULT_NEWSNOW_BASE_URL = "https://newsnow.busiyi.world";
const DEFAULT_NEWSNOW_TIMEOUT_MS = 10_000;

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");

const toPositiveInt = (value: string | undefined, fallback: number) => {
	const parsed = value ? Number(value) : Number.NaN;
	return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
};

const readNewsNowConfig = (): NewsNowConfig => ({
	baseUrl: normalizeBaseUrl(
		process.env.NEOBUNI_NEWSNOW_BASE_URL?.trim() || DEFAULT_NEWSNOW_BASE_URL
	),
	timeoutMs: toPositiveInt(
		process.env.NEOBUNI_NEWS_TIMEOUT_MS,
		DEFAULT_NEWSNOW_TIMEOUT_MS
	),
});

const asRecord = (value: unknown): Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

const asString = (value: unknown) =>
	typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const asIsoString = (value: unknown) => {
	const text = asString(value);
	return text && !Number.isNaN(Date.parse(text))
		? new Date(text).toISOString()
		: null;
};

const buildFetchSignal = (input: {
	timeoutMs: number;
	signal?: AbortSignal;
}) => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => {
		controller.abort(new Error("NewsNow request timed out."));
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

const normalizeNewsNowItems = (input: {
	sourceId: NewsSourceId;
	sourceName: string;
	items: unknown;
	count?: number;
}) => {
	const items = Array.isArray(input.items) ? input.items : [];

	const normalized = items.flatMap((item, index) => {
		const record = asRecord(item);
		const title = asString(record.title);
		const url = asString(record.url);

		if (!(title && url)) {
			return [];
		}

		return [
			{
				rank: index + 1,
				sourceId: input.sourceId,
				sourceName: input.sourceName,
				title,
				url,
				mobileUrl: asString(record.mobileUrl),
				publishedAt: asIsoString(record.pubDate),
			},
		] satisfies NewsHeadline[];
	});

	return input.count === undefined
		? normalized
		: normalized.slice(0, input.count);
};

const fetchNewsNowSource = async (input: {
	sourceId: NewsSourceId;
	count?: number;
	signal?: AbortSignal;
	config?: NewsNowConfig;
	deps?: Partial<NewsNowFetchDeps>;
}): Promise<NewsNowSourcePayload> => {
	const source = getNewsSourceById(input.sourceId);

	if (!source) {
		throw new Error(`Unknown NewsNow source: ${input.sourceId}`);
	}

	const config = input.config ?? readNewsNowConfig();
	const deps = {
		fetch,
		...(input.deps ?? {}),
	};
	const request = buildFetchSignal({
		timeoutMs: config.timeoutMs,
		signal: input.signal,
	});

	try {
		const response = await deps.fetch(
			`${config.baseUrl}/api/s?id=${encodeURIComponent(input.sourceId)}`,
			{
				method: "GET",
				signal: request.signal,
				headers: {
					Accept: "application/json",
				},
			}
		);

		if (!response.ok) {
			const body = await response.text();
			throw new Error(
				`NewsNow source request failed (${response.status}): ${body.slice(0, 240)}`
			);
		}

		const payload = asRecord(await response.json());
		const sourceName =
			asString(payload.title) ??
			asString(payload.name) ??
			getNewsSourceDisplayName(source);

		return {
			provider: "newsnow",
			sourceId: input.sourceId,
			sourceName,
			updatedTime: asIsoString(payload.updatedTime),
			items: normalizeNewsNowItems({
				sourceId: input.sourceId,
				sourceName,
				items: payload.items,
				count: input.count,
			}),
		};
	} finally {
		request.cleanup();
	}
};

export type { NewsNowConfig, NewsNowFetchDeps, NewsNowSourcePayload };
export {
	DEFAULT_NEWSNOW_BASE_URL,
	DEFAULT_NEWSNOW_TIMEOUT_MS,
	fetchNewsNowSource,
	normalizeNewsNowItems,
	readNewsNowConfig,
};
