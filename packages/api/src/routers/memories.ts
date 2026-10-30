import {
  memoryCreateSchema,
  memoryTypeSchema,
  memoryUpdateSchema,
} from "@neobuni/contracts";
import {
  appendEvent,
  createMemory,
  deleteMemory,
  deleteMemoryEmbedding,
  getMemory,
  listMemories,
  updateMemory,
} from "@neobuni/db";
import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { run } from "../run";

const memoryIdInput = z.object({ memoryId: z.string().min(1) });

const memoryListInput = z.object({
  type: memoryTypeSchema.optional(),
  unresolved: z.enum(["true", "false"]).optional(),
});

const requireMemory = async (profileId: string, memoryId: string) => {
  const memory = await run(getMemory(memoryId));

  if (!memory || memory.profileId !== profileId) {
    throw new ORPCError("NOT_FOUND", { message: "Memory not found" });
  }

  return memory;
};

// TODO(server): search - requires recallMemories (apps/server temporal-memory-store).
// TODO(server): digest - requires runManualDigest (apps/server digest pipeline).
// TODO(server): reindex - requires syncMemoryEmbedding (apps/server memory stores).
export const memoriesRouter = {
  list: protectedProcedure
    .route({
      method: "GET",
      path: "/memories",
      summary: "List memories",
      description:
        "Return stored memories for the current profile, optionally filtered by type or unresolved flag.",
      tags: ["Memories"],
    })
    .input(memoryListInput)
    .handler(({ input, context }) =>
      run(
        listMemories(context.profileId, {
          type: input.type,
          unresolved:
            input.unresolved === undefined
              ? undefined
              : input.unresolved === "true",
        })
      )
    ),

  get: protectedProcedure
    .route({
      method: "GET",
      path: "/memories/{memoryId}",
      summary: "Get a memory",
      description:
        "Return one memory owned by the current profile, or 404 when it does not exist.",
      tags: ["Memories"],
    })
    .input(memoryIdInput)
    .handler(({ input, context }) =>
      requireMemory(context.profileId, input.memoryId)
    ),

  create: protectedProcedure
    .route({
      method: "POST",
      path: "/memories",
      summary: "Create a memory",
      description:
        "Store a memory for the current profile and record a creation event.",
      tags: ["Memories"],
    })
    .input(memoryCreateSchema)
    .handler(async ({ input, context }) => {
      const memory = await run(createMemory(context.profileId, input));

      // TODO(server): embed the memory via syncMemoryEmbedding (apps/server memory stores).

      await run(
        appendEvent(context.profileId, "memory.created", {
          memoryId: memory.id,
          type: memory.type,
        })
      );

      return memory;
    }),

  update: protectedProcedure
    .route({
      method: "PATCH",
      path: "/memories/{memoryId}",
      summary: "Update a memory",
      description:
        "Patch a memory's content, classification, or lifecycle status and record an update event.",
      tags: ["Memories"],
    })
    .input(memoryIdInput.merge(memoryUpdateSchema))
    .handler(async ({ input, context }) => {
      const { memoryId, ...payload } = input;
      await requireMemory(context.profileId, memoryId);

      const memory = await run(updateMemory(memoryId, payload));

      if (!memory) {
        throw new ORPCError("NOT_FOUND", { message: "Memory not found" });
      }

      // TODO(server): re-embed on content/status changes via syncMemoryEmbedding
      // (apps/server memory stores).

      await run(appendEvent(context.profileId, "memory.updated", { memoryId }));

      return memory;
    }),

  remove: protectedProcedure
    .route({
      method: "DELETE",
      path: "/memories/{memoryId}",
      summary: "Delete a memory",
      description:
        "Delete a memory and its embedding row, then record a deletion event.",
      tags: ["Memories"],
    })
    .input(memoryIdInput)
    .handler(async ({ input, context }) => {
      await requireMemory(context.profileId, input.memoryId);

      await run(deleteMemory(input.memoryId));
      // The vec_memories row may not exist, so this cleanup is best effort.
      await run(deleteMemoryEmbedding(input.memoryId).pipe(Effect.ignore));

      await run(
        appendEvent(context.profileId, "memory.deleted", {
          memoryId: input.memoryId,
        })
      );

      return { id: input.memoryId };
    }),
};
