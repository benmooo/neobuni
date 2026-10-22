import { runtimeRecentActivitySchema } from "@neobuni/contracts";
import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";

const RUNTIME_RECENT_ACTIVITY_QUERY_KEY = [
  "runtime",
  "activity",
  "recent",
] as const;

function useRuntimeRecentActivity(limit = 8) {
  return useQuery({
    queryKey: [...RUNTIME_RECENT_ACTIVITY_QUERY_KEY, limit],
    queryFn: async () =>
      runtimeRecentActivitySchema.parse(
        await api.runtime.recentActivity({ limit })
      ),
    staleTime: 10_000,
  });
}

export { RUNTIME_RECENT_ACTIVITY_QUERY_KEY, useRuntimeRecentActivity };
