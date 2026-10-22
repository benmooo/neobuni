import {
  appendEvent as appendEventFx,
  getMemory as getMemoryFx,
  runRepo,
  updateMemory as updateMemoryFx,
} from "@neobuni/db";

const appendEvent = (...args: Parameters<typeof appendEventFx>) =>
  runRepo(appendEventFx(...args));
const getMemory = (...args: Parameters<typeof getMemoryFx>) =>
  runRepo(getMemoryFx(...args));
const updateMemory = (...args: Parameters<typeof updateMemoryFx>) =>
  runRepo(updateMemoryFx(...args));

import { markTaskDoneDef, markTaskDoneInputSchema } from "@neobuni/contracts";
import { syncMemoryEmbedding } from "../memory/memory-write-side-effects";
import type { ServerToolContext } from "./types";

const createMarkTaskDoneTool = (context: ServerToolContext) =>
  markTaskDoneDef.server(async (args) => {
    const input = markTaskDoneInputSchema.parse(args);
    const existing = await getMemory(input.memoryId);

    if (!existing || existing.profileId !== context.profileId) {
      throw new Error(`Memory ${input.memoryId} not found.`);
    }

    if (existing.type !== "task") {
      throw new Error("mark_task_done can only be used with task memories.");
    }

    if (existing.status === "done" && !existing.unresolved) {
      return {
        completed: true,
        task: existing,
        note: "Task was already marked done.",
      };
    }

    const task = await updateMemory(existing.id, {
      unresolved: false,
      status: "done",
    });

    if (!task) {
      throw new Error(`Task memory ${existing.id} disappeared during update.`);
    }

    await syncMemoryEmbedding({
      embeddingConfig: context.embeddingConfig,
      memoryId: task.id,
      content: task.content,
      status: task.status,
    });

    await appendEvent(context.profileId, "tool.mark_task_done", {
      conversationId: context.conversationId,
      turnId: context.turnId,
      memoryId: task.id,
      resolutionNote: input.resolutionNote ?? null,
    });

    return {
      completed: true,
      task,
      note: input.resolutionNote ?? "Marked task memory as done.",
    };
  });

export { createMarkTaskDoneTool };
