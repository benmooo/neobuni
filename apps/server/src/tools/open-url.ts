import { appendEvent as appendEventFx, runRepo } from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
	runRepo(appendEventFx(...args));

import { openUrlDef, openUrlInputSchema } from "@neobuni/contracts";

import { fetchWebclawPage } from "../integrations/web/webclaw";
import type { ServerToolContext } from "./types";

type OpenUrlDeps = {
	appendEvent: typeof appendEvent;
	fetchWebclawPage: typeof fetchWebclawPage;
};

const createOpenUrlTool = (
	context: ServerToolContext,
	deps: OpenUrlDeps = {
		appendEvent,
		fetchWebclawPage,
	}
) =>
	openUrlDef.server(async (args) => {
		const input = openUrlInputSchema.parse(args);
		const result = await deps.fetchWebclawPage({
			url: input.url,
			signal: context.abortSignal,
		});

		await deps.appendEvent(context.profileId, "tool.open_url", {
			conversationId: context.conversationId,
			turnId: context.turnId,
			provider: result.provider,
			url: input.url,
		});

		return result;
	});

export { createOpenUrlTool };
