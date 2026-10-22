import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../lib/api";

const QUERY_KEY = ["memories"] as const;

type MemoryType = "event" | "thought" | "preference" | "fact" | "task";

const toUnresolvedFilter = (unresolved: boolean | undefined) => {
  if (unresolved === undefined) {
    return;
  }

  return unresolved ? "true" : "false";
};

function useMemoryList(filters?: { type?: MemoryType; unresolved?: boolean }) {
  const unresolved = toUnresolvedFilter(filters?.unresolved);

  return useQuery({
    queryKey: [...QUERY_KEY, filters],
    queryFn: () =>
      api.memories.list({
        type: filters?.type,
        unresolved,
      }),
    staleTime: 30_000,
  });
}

function useCreateMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      content: string;
      type: MemoryType;
      keywords: string[];
      importance: number;
      unresolved: boolean;
    }) => api.memories.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

function useUpdateMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      content?: string;
      type?: MemoryType;
      keywords?: string[];
      importance?: number;
      unresolved?: boolean;
    }) => api.memories.update({ memoryId: id, ...input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

function useDeleteMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.memories.remove({ memoryId: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

function useDigestMemories() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) =>
      api.memories.digest({ conversationId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

function useReindexMemories() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.memories.reindex(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export type { MemoryType };
export {
  useCreateMemory,
  useDeleteMemory,
  useDigestMemories,
  useMemoryList,
  useReindexMemories,
  useUpdateMemory,
};
