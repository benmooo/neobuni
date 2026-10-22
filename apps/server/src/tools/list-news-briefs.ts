import { listNewsBriefsDef } from "@neobuni/contracts";

import { listNewsBriefs } from "../integrations/news/newsnow-catalog";
import type { ServerToolContext } from "./types";

const createListNewsBriefsTool = (_context: ServerToolContext) =>
  listNewsBriefsDef.server(async () => {
    const items = listNewsBriefs();

    return {
      count: items.length,
      items,
    };
  });

export { createListNewsBriefsTool };
