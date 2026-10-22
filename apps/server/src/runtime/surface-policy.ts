import type { RuntimeSurface, SurfacePolicy } from "@neobuni/contracts";

import { scheduleMutationToolNameSet } from "../tools/execution-tool-names";

const publicSafeResearchAndDeliveryToolAllowlist = [
  "get_news_brief",
  "get_news_headlines",
  "list_channel_targets",
  "list_news_briefs",
  "list_news_sources",
  "now",
  "open_url",
  "extract_page",
  "resolve_news_source",
  "search_news_sources",
  "search_web",
  "send_channel_message",
  "summarize_page",
] as const;

const publicSafeChatToolAllowlist = [
  "create_schedule",
  "create_reminder",
  "delete_schedule",
  ...publicSafeResearchAndDeliveryToolAllowlist,
  "get_schedule",
  "list_schedules",
  "update_schedule",
] as const;

const getSurfacePolicy = (surface: RuntimeSurface): SurfacePolicy => {
  if (surface === "chat_public_safe") {
    return {
      surface,
      allowMemoryRecall: false,
      allowMemoryWrite: false,
      allowAutobiographicalContext: false,
      allowScheduleMutation: true,
      toolAllowlist: [...publicSafeChatToolAllowlist],
      responseVisibility: "group",
    };
  }

  if (surface === "task_run_public_safe") {
    return {
      surface,
      allowMemoryRecall: false,
      allowMemoryWrite: false,
      allowAutobiographicalContext: false,
      allowScheduleMutation: false,
      toolAllowlist: [...publicSafeResearchAndDeliveryToolAllowlist],
      responseVisibility: "group",
    };
  }

  return {
    surface,
    allowMemoryRecall: true,
    allowMemoryWrite: true,
    allowAutobiographicalContext: true,
    allowScheduleMutation: true,
    toolAllowlist: null,
    responseVisibility: "private",
  };
};

const filterToolNamesForSurfacePolicy = (
  toolNames: readonly string[],
  policy: SurfacePolicy
) =>
  toolNames.filter(
    (toolName) =>
      policy.allowScheduleMutation || !scheduleMutationToolNameSet.has(toolName)
  );

const applyMemoryPolicy = <T>(input: {
  policy: SurfacePolicy;
  unresolvedSlices: T[];
  recentSlices: T[];
}) =>
  input.policy.allowMemoryRecall
    ? {
        unresolvedSlices: [...input.unresolvedSlices],
        recentSlices: [...input.recentSlices],
      }
    : {
        unresolvedSlices: [] as T[],
        recentSlices: [] as T[],
      };

export { applyMemoryPolicy, filterToolNamesForSurfacePolicy, getSurfacePolicy };
