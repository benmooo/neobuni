import type {
  CreateScheduleInput,
  Schedule,
  UpdateScheduleToolInput,
} from "@neobuni/contracts";
import { scheduleBlueprintSchema } from "@neobuni/contracts";

import type { ServerToolContext } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeScheduleBlueprint = (value: unknown): Schedule["blueprint"] => {
  const parsed = scheduleBlueprintSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const buildScheduleBlueprintFromCreateInput = (
  input: CreateScheduleInput & {
    conversationId: string | null;
  }
) => ({
  version: 1 as const,
  prompt: input.taskPrompt,
  toolAllowlist: input.toolAllowlist ?? null,
  maxSteps: input.maxSteps ?? null,
  timeoutMs: input.timeoutMs ?? null,
  deliveryIntent: {
    conversationId:
      input.deliverToConversation === false ? null : input.conversationId,
    channelTarget: input.channelTarget ?? null,
  },
  input: input.input ?? null,
});

const mergeScheduleBlueprintForUpdate = (input: {
  existing: unknown;
  update: UpdateScheduleToolInput;
  context: Pick<ServerToolContext, "conversationId">;
}) => {
  if (input.update.blueprint !== undefined) {
    return input.update.blueprint;
  }

  const existing = normalizeScheduleBlueprint(input.existing);

  const currentDeliveryIntent = isRecord(existing?.deliveryIntent)
    ? existing.deliveryIntent
    : null;

  const conversationId =
    input.update.deliverToConversation === undefined
      ? typeof currentDeliveryIntent?.conversationId === "string"
        ? currentDeliveryIntent.conversationId
        : currentDeliveryIntent?.conversationId === null
          ? null
          : input.context.conversationId
      : input.update.deliverToConversation
        ? input.context.conversationId
        : null;

  const channelTarget =
    input.update.channelTarget === undefined
      ? isRecord(currentDeliveryIntent?.channelTarget)
        ? currentDeliveryIntent.channelTarget
        : null
      : input.update.channelTarget;

  return {
    version: 1 as const,
    prompt:
      input.update.taskPrompt ??
      (typeof existing?.prompt === "string" ? existing.prompt : ""),
    toolAllowlist:
      input.update.toolAllowlist ??
      (Array.isArray(existing?.toolAllowlist) ? existing.toolAllowlist : null),
    maxSteps:
      input.update.maxSteps ??
      (typeof existing?.maxSteps === "number" ? existing.maxSteps : null),
    timeoutMs:
      input.update.timeoutMs ??
      (typeof existing?.timeoutMs === "number" ? existing.timeoutMs : null),
    deliveryIntent: {
      conversationId,
      channelTarget,
    },
    input:
      input.update.input ??
      (isRecord(existing?.input)
        ? existing.input
        : existing?.input === null
          ? null
          : null),
  };
};

export {
  buildScheduleBlueprintFromCreateInput,
  mergeScheduleBlueprintForUpdate,
  normalizeScheduleBlueprint,
};
