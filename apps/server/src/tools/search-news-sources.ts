import {
  searchNewsSourcesDef,
  searchNewsSourcesInputSchema,
} from "@neobuni/contracts";

import { searchNewsSources } from "../integrations/news/newsnow-catalog";
import type { ServerToolContext } from "./types";

const createSearchNewsSourcesTool = (_context: ServerToolContext) =>
  searchNewsSourcesDef.server(async (args) => {
    const input = searchNewsSourcesInputSchema.parse(args);
    const items = searchNewsSources(input);

    return {
      count: items.length,
      items,
    };
  });

export { createSearchNewsSourcesTool };
