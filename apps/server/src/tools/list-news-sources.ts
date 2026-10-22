import {
	listNewsSourcesDef,
	listNewsSourcesInputSchema,
} from "@neobuni/contracts";

import { listAllNewsSources } from "../integrations/news/newsnow-catalog";
import type { ServerToolContext } from "./types";

const createListNewsSourcesTool = (_context: ServerToolContext) =>
	listNewsSourcesDef.server(async (args) => {
		listNewsSourcesInputSchema.parse(args);
		const items = listAllNewsSources();

		return {
			count: items.length,
			items,
		};
	});

export { createListNewsSourcesTool };
