import type { NewsSourceId } from "@neobuni/contracts";

import { fetchNewsNowSource } from "./newsnow";
import { listAllNewsSources } from "./newsnow-catalog";

type NewsNowDoctorResult = {
	sourceId: NewsSourceId;
	sourceName: string;
	status: "ok" | "error";
	itemCount: number;
	error: string | null;
};

const DEFAULT_CONCURRENCY = 6;

const toPositiveInt = (value: string | undefined, fallback: number) => {
	const parsed = value ? Number(value) : Number.NaN;
	return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
};

const createWorkerIndexes = (input: {
	itemCount: number;
	concurrency: number;
}) =>
	Array.from(
		{ length: Math.min(input.itemCount, input.concurrency) },
		(_, index) => index
	);

const runWithConcurrency = async <T, R>(input: {
	items: readonly T[];
	concurrency: number;
	run: (item: T) => Promise<R>;
}) => {
	const results = new Array<R>(input.items.length);
	const workerIndexes = createWorkerIndexes({
		itemCount: input.items.length,
		concurrency: input.concurrency,
	});

	await Promise.all(
		workerIndexes.map(async (workerIndex) => {
			for (
				let itemIndex = workerIndex;
				itemIndex < input.items.length;
				itemIndex += workerIndexes.length
			) {
				results[itemIndex] = await input.run(input.items[itemIndex]!);
			}
		})
	);

	return results;
};

const probeNewsNowSource = async (sourceId: NewsSourceId) => {
	try {
		const payload = await fetchNewsNowSource({
			sourceId,
			count: 1,
		});

		return {
			sourceId,
			sourceName: payload.sourceName,
			status: "ok",
			itemCount: payload.items.length,
			error: null,
		} satisfies NewsNowDoctorResult;
	} catch (error) {
		return {
			sourceId,
			sourceName: sourceId,
			status: "error",
			itemCount: 0,
			error: error instanceof Error ? error.message : String(error),
		} satisfies NewsNowDoctorResult;
	}
};

const runNewsNowDoctor = async (input?: { concurrency?: number }) => {
	const sources = listAllNewsSources();
	const results = await runWithConcurrency({
		items: sources,
		concurrency: input?.concurrency ?? DEFAULT_CONCURRENCY,
		run: (source) => probeNewsNowSource(source.sourceId),
	});
	const failedCount = results.filter(
		(result) => result.status === "error"
	).length;

	return {
		sourceCount: sources.length,
		failedCount,
		results,
	};
};

if (import.meta.main) {
	const result = await runNewsNowDoctor({
		concurrency: toPositiveInt(
			process.env.NEOBUNI_NEWSNOW_DOCTOR_CONCURRENCY,
			DEFAULT_CONCURRENCY
		),
	});

	result.results.forEach((item) => {
		const details =
			item.status === "ok" ? `items=${item.itemCount}` : `error=${item.error}`;
		console.log(`[newsnow:doctor] ${item.status} ${item.sourceId} ${details}`);
	});

	console.log(
		`[newsnow:doctor] sources=${result.sourceCount} failed=${result.failedCount}`
	);

	if (result.failedCount > 0) {
		process.exitCode = 1;
	}
}

export type { NewsNowDoctorResult };
export { probeNewsNowSource, runNewsNowDoctor, runWithConcurrency };
