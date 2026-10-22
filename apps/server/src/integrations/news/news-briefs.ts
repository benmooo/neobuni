import type {
  NewsBrief,
  NewsBriefId,
  NewsHeadline,
  NewsSourceFetchResult,
} from "@neobuni/contracts";

import { fetchNewsNowSource } from "./newsnow";
import {
  getNewsBriefById,
  getNewsSourceById,
  getNewsSourceDisplayName,
} from "./newsnow-catalog";

interface GetNewsBriefResult {
  briefId: NewsBriefId;
  briefLabel: string;
  count: number;
  items: NewsHeadline[];
  notes: string[];
  provider: "newsnow";
  sourceCount: number;
  sources: NewsSourceFetchResult[];
  updatedTime: string | null;
}

interface GetNewsBriefDeps {
  fetchNewsNowSource: typeof fetchNewsNowSource;
}

const interleaveHeadlines = (groups: NewsHeadline[][], maxItems: number) => {
  const nextGroups = groups.map((group) => [...group]);
  const items: NewsHeadline[] = [];

  while (items.length < maxItems) {
    const progressed = nextGroups.reduce((changed, group) => {
      if (items.length >= maxItems) {
        return changed;
      }

      const next = group.shift();

      if (!next) {
        return changed;
      }

      items.push(next);
      return true;
    }, false);

    if (!progressed) {
      break;
    }
  }

  return items;
};

const getLatestUpdatedTime = (sources: NewsSourceFetchResult[]) =>
  sources
    .map((source) => source.updatedTime)
    .filter((value): value is string => value !== null)
    .sort((left, right) => right.localeCompare(left))[0] ?? null;

const getNewsBrief = async (input: {
  briefId: NewsBriefId;
  countPerSource?: number;
  maxItems?: number;
  signal?: AbortSignal;
  deps?: Partial<GetNewsBriefDeps>;
}): Promise<GetNewsBriefResult> => {
  const brief = getNewsBriefById(input.briefId);

  if (!brief) {
    throw new Error(`Unknown news brief: ${input.briefId}`);
  }

  const deps = {
    fetchNewsNowSource,
    ...input.deps,
  };
  const countPerSource = input.countPerSource ?? 4;
  const maxItems = input.maxItems ?? 8;
  const settled = await Promise.allSettled(
    brief.sourceIds.map(async (sourceId) =>
      deps.fetchNewsNowSource({
        sourceId,
        count: countPerSource,
        signal: input.signal,
      })
    )
  );

  const sourceResults = settled.map((result, index) => {
    const sourceId = brief.sourceIds[index]!;
    const source = getNewsSourceById(sourceId);
    const sourceName = source ? getNewsSourceDisplayName(source) : sourceId;

    if (result.status === "rejected") {
      return {
        sourceId,
        sourceName,
        status: "error",
        updatedTime: null,
        itemCount: 0,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : "News source request failed.",
      } satisfies NewsSourceFetchResult;
    }

    return {
      sourceId,
      sourceName: result.value.sourceName,
      status: "ok",
      updatedTime: result.value.updatedTime,
      itemCount: result.value.items.length,
      error: null,
    } satisfies NewsSourceFetchResult;
  });

  const successfulGroups = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value.items] : []
  );
  const items = interleaveHeadlines(successfulGroups, maxItems);
  const failedSources = sourceResults.filter(
    (source) => source.status === "error"
  );
  const notes = [
    ...(failedSources.length > 0
      ? [
          `Some sources were unavailable: ${failedSources
            .map((source) => source.sourceName)
            .join(", ")}.`,
        ]
      : []),
    ...(items.length === 0
      ? ["No headlines were returned from the configured sources."]
      : []),
  ];

  return {
    provider: "newsnow",
    briefId: brief.briefId,
    briefLabel: brief.label,
    updatedTime: getLatestUpdatedTime(sourceResults),
    count: items.length,
    sourceCount: brief.sourceIds.length,
    items,
    sources: sourceResults,
    notes,
  };
};

const listBriefSourceCatalog = (brief: NewsBrief) =>
  brief.sourceIds.flatMap((sourceId) => {
    const source = getNewsSourceById(sourceId);
    return source ? [source] : [];
  });

export type { GetNewsBriefDeps, GetNewsBriefResult };
export {
  getLatestUpdatedTime,
  getNewsBrief,
  interleaveHeadlines,
  listBriefSourceCatalog,
};
