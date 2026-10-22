import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
	runRepo(appendEventFx(...args));

import { summarizePageDef, summarizePageInputSchema } from "@neobuni/contracts";

import { fetchWebclawPage } from "../integrations/web/webclaw";
import { summarizeWebPage } from "../web/summarize-web-page";
import type { ServerToolContext } from "./types";

type SummarizePageDeps = {
	appendEvent: typeof appendEvent;
	fetchWebclawPage: typeof fetchWebclawPage;
	summarizeWebPage: typeof summarizeWebPage;
};

const createSummarizePageTool = (
	context: ServerToolContext,
	deps: SummarizePageDeps = {
		appendEvent,
		fetchWebclawPage,
		summarizeWebPage,
	}
) =>
	summarizePageDef.server(async (args) => {
		const input = summarizePageInputSchema.parse(args);
		const page = await deps.fetchWebclawPage({
			url: input.url,
			signal: context.abortSignal,
		});
		const summary = await deps.summarizeWebPage({
			profileId: context.profileId,
			document: page.document,
			goal: input.goal,
			length: input.length,
			signal: context.abortSignal,
		});

		await deps.appendEvent(context.profileId, "tool.summarize_page", {
			conversationId: context.conversationId,
			turnId: context.turnId,
			provider: page.provider,
			url: input.url,
			length: input.length,
		});

		return {
			document: {
				url: page.document.url,
				finalUrl: page.document.finalUrl,
				title: page.document.title,
				siteName: page.document.siteName,
				publishedAt: page.document.publishedAt,
			},
			summary: summary.summary,
			notes: summary.notes,
		};
	});

export { createSummarizePageTool };
