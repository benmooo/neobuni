import {
  appendEvent,
  deleteKnowledgeChunkEmbedding,
  deleteKnowledgeChunkFtsEntries,
  deleteKnowledgeDocument,
  getKnowledgeDocumentDetail,
  listKnowledgeDocumentsVisible,
} from "@neobuni/db";
import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { run } from "../run";

const documentIdInput = z.object({ documentId: z.string().min(1) });

const requireKnowledgeDocument = async (
  profileId: string,
  documentId: string
) => {
  const detail = await run(getKnowledgeDocumentDetail(profileId, documentId));

  if (!detail) {
    throw new ORPCError("NOT_FOUND", {
      message: "Knowledge document not found",
    });
  }

  return detail;
};

// TODO(server): create - requires ingestKnowledgeDocument (apps/server knowledge ingest
// service) plus toOpenAICompatibleConfig and the memory provider configs.
export const knowledgeRouter = {
  list: protectedProcedure
    .route({
      method: "GET",
      path: "/knowledge",
      summary: "List knowledge documents",
      description:
        "Return knowledge documents visible to the current profile, including globally shared sources.",
      tags: ["Knowledge"],
    })
    .handler(({ context }) =>
      run(listKnowledgeDocumentsVisible(context.profileId))
    ),

  get: protectedProcedure
    .route({
      method: "GET",
      path: "/knowledge/{documentId}",
      summary: "Get a knowledge document",
      description:
        "Return one knowledge document with its chunks and extracted facts.",
      tags: ["Knowledge"],
    })
    .input(documentIdInput)
    .handler(({ input, context }) =>
      requireKnowledgeDocument(context.profileId, input.documentId)
    ),

  remove: protectedProcedure
    .route({
      method: "DELETE",
      path: "/knowledge/{documentId}",
      summary: "Delete a knowledge document",
      description:
        "Delete a profile-owned knowledge document together with its chunks, full-text entries, and embeddings.",
      tags: ["Knowledge"],
    })
    .input(documentIdInput)
    .handler(async ({ input, context }) => {
      const detail = await requireKnowledgeDocument(
        context.profileId,
        input.documentId
      );

      if (detail.profileId !== context.profileId) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only profile-owned knowledge documents can be deleted",
        });
      }

      const chunkIds = detail.chunks.map((chunk) => chunk.id);
      await run(deleteKnowledgeChunkFtsEntries(chunkIds));

      // The vec_knowledge_chunks rows may not exist, so this cleanup is best effort.
      await Promise.all(
        chunkIds.map((chunkId) =>
          run(deleteKnowledgeChunkEmbedding(chunkId).pipe(Effect.ignore))
        )
      );

      await run(deleteKnowledgeDocument(input.documentId));
      await run(
        appendEvent(context.profileId, "knowledge.deleted", {
          documentId: input.documentId,
          chunkCount: detail.chunkCount,
          factCount: detail.factCount,
        })
      );

      return { id: input.documentId };
    }),
};
