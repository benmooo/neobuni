import type { KnowledgeDocumentCreateInput } from "@neobuni/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../lib/api";

const QUERY_KEY = ["knowledge"] as const;

function useKnowledgeDocuments() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.knowledge.list(),
    staleTime: 30_000,
  });
}

function useKnowledgeDocumentDetail(documentId: string | null) {
  return useQuery({
    queryKey: [...QUERY_KEY, documentId],
    enabled: Boolean(documentId),
    queryFn: () => {
      if (!documentId) {
        throw new Error("Missing knowledge document id");
      }

      return api.knowledge.get({ documentId });
    },
  });
}

function useCreateKnowledgeDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: KnowledgeDocumentCreateInput) =>
      api.knowledge.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

function useDeleteKnowledgeDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (documentId: string) => api.knowledge.remove({ documentId }),
    onSuccess: (_, documentId) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.removeQueries({ queryKey: [...QUERY_KEY, documentId] });
    },
  });
}

export {
  useCreateKnowledgeDocument,
  useDeleteKnowledgeDocument,
  useKnowledgeDocumentDetail,
  useKnowledgeDocuments,
};
