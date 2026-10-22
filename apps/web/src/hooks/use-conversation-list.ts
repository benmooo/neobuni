import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../lib/api";

const QUERY_KEY = ["conversations"] as const;

function useConversationList() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.conversations.list(),
    staleTime: 30_000,
  });
}

function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (title: string) =>
      api.conversations.create({ title, modelKey: "default" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.conversations.remove({ conversationId: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

function useRenameConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.conversations.rename({ conversationId: id, title }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["conversation", id] });
    },
  });
}

export {
  useConversationList,
  useCreateConversation,
  useDeleteConversation,
  useRenameConversation,
};
