import { runtimeProviderChecksSchema } from "@neobuni/contracts";
import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";

const RUNTIME_PROVIDER_CHECKS_QUERY_KEY = [
	"config",
	"runtime",
	"provider-checks",
] as const;

function useRuntimeProviderChecks() {
	return useQuery({
		queryKey: RUNTIME_PROVIDER_CHECKS_QUERY_KEY,
		queryFn: async () =>
			runtimeProviderChecksSchema.parse(await api.config.providerChecks()),
		staleTime: 60_000,
		refetchOnWindowFocus: false,
	});
}

export { RUNTIME_PROVIDER_CHECKS_QUERY_KEY, useRuntimeProviderChecks };
