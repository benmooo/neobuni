import {
  type RuntimeProviderSummary,
  runtimeConfigSchema,
} from "@neobuni/contracts";
import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";

const RUNTIME_CONFIG_QUERY_KEY = ["config", "runtime"] as const;

const formatRuntimeStatus = (ready: boolean) => (ready ? "ready" : "check");

const formatRuntimeProviderSummary = (summary: RuntimeProviderSummary) => {
  if (!summary.configured) {
    return "未配置";
  }

  const parts = [
    summary.provider ?? "unknown",
    summary.protocol ?? "unknown-protocol",
    summary.model ?? "no-model",
    summary.enabled ? "enabled" : "disabled",
    summary.hasApiKey ? "key" : "no-key",
  ];

  return parts.join(" · ");
};

function useRuntimeConfig() {
  return useQuery({
    queryKey: RUNTIME_CONFIG_QUERY_KEY,
    queryFn: async () => runtimeConfigSchema.parse(await api.config.runtime()),
    staleTime: 10_000,
  });
}

export {
  formatRuntimeProviderSummary,
  formatRuntimeStatus,
  RUNTIME_CONFIG_QUERY_KEY,
  useRuntimeConfig,
};
