import type { FeishuReceiveIdType } from "@neobuni/contracts";
import { feishuReceiveIdTypeSchema } from "@neobuni/contracts";
import { z } from "zod";

const isoDateTimeSchema = z.string().datetime();
const nonEmptyStringSchema = z.string().trim().min(1);

const scheduleChatDeliveryStateSchema = z.object({
  messageId: nonEmptyStringSchema.optional(),
  deliveredAt: isoDateTimeSchema.optional(),
});

const scheduleFeishuDeliveryStateSchema = z.object({
  targetAlias: nonEmptyStringSchema.nullable().optional(),
  receiveIdType: feishuReceiveIdTypeSchema.optional(),
  receiveId: nonEmptyStringSchema.optional(),
  messageId: nonEmptyStringSchema.nullable().optional(),
  deliveredAt: isoDateTimeSchema.optional(),
});

const scheduleDeliveryStateSchema = z.object({
  chat: scheduleChatDeliveryStateSchema.optional(),
  feishu: scheduleFeishuDeliveryStateSchema.optional(),
});

type ScheduleChatDeliveryState = z.infer<
  typeof scheduleChatDeliveryStateSchema
>;
type ScheduleFeishuDeliveryState = z.infer<
  typeof scheduleFeishuDeliveryStateSchema
>;
type ScheduleDeliveryState = z.infer<typeof scheduleDeliveryStateSchema>;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const readScheduleDeliveryState = (
  metadata: Record<string, unknown>
): ScheduleDeliveryState => {
  const parsed = scheduleDeliveryStateSchema.safeParse(metadata.delivery);
  return parsed.success ? parsed.data : {};
};

const readConversationId = (metadata: Record<string, unknown>) => {
  const parsed = nonEmptyStringSchema.safeParse(metadata.conversationId);
  return parsed.success ? parsed.data : null;
};

const readLocalDisplay = (metadata: Record<string, unknown>) => {
  const parsed = nonEmptyStringSchema.safeParse(metadata.localDisplay);
  return parsed.success ? parsed.data : null;
};

const readFeishuTargetAlias = (metadata: Record<string, unknown>) => {
  const parsed = nonEmptyStringSchema.safeParse(metadata.feishuTargetAlias);
  return parsed.success ? parsed.data : null;
};

const withChatDeliveryState = (
  metadata: Record<string, unknown>,
  chat: ScheduleChatDeliveryState
) => ({
  ...metadata,
  delivery: {
    ...readScheduleDeliveryState(metadata),
    chat,
  },
});

const withFeishuDeliveryState = (
  metadata: Record<string, unknown>,
  feishu: ScheduleFeishuDeliveryState
) => ({
  ...metadata,
  delivery: {
    ...readScheduleDeliveryState(metadata),
    feishu,
  },
});

const clearScheduleDeliveryState = (metadata: Record<string, unknown>) => {
  const next = {
    ...metadata,
  };

  next.delivery = undefined;

  return next;
};

interface ReminderFeishuTarget {
  receiveId?: string;
  receiveIdType?: FeishuReceiveIdType;
  targetAlias: string | null;
}

const resolveReminderFeishuTarget = (input: {
  metadata: Record<string, unknown>;
  availableTargets: Array<{
    alias: string;
    receiveIdType: FeishuReceiveIdType;
  }>;
}): ReminderFeishuTarget | null => {
  const deliveryState = readScheduleDeliveryState(input.metadata);
  const explicitAlias =
    readFeishuTargetAlias(input.metadata) ?? deliveryState.feishu?.targetAlias;
  const explicitReceiveIdType = deliveryState.feishu?.receiveIdType;
  const explicitReceiveId = deliveryState.feishu?.receiveId;

  if (explicitAlias) {
    const target = input.availableTargets.find(
      (item) => item.alias === explicitAlias
    );

    return target
      ? {
          targetAlias: explicitAlias,
          receiveIdType: target.receiveIdType,
        }
      : null;
  }

  if (explicitReceiveIdType && explicitReceiveId) {
    return {
      targetAlias: null,
      receiveIdType: explicitReceiveIdType,
      receiveId: explicitReceiveId,
    };
  }

  if (input.availableTargets.length === 1) {
    const target = input.availableTargets[0]!;
    return {
      targetAlias: target.alias,
      receiveIdType: target.receiveIdType,
    };
  }

  return null;
};

export type {
  ReminderFeishuTarget,
  ScheduleChatDeliveryState,
  ScheduleDeliveryState,
  ScheduleFeishuDeliveryState,
};
export {
  asRecord,
  clearScheduleDeliveryState,
  readConversationId,
  readFeishuTargetAlias,
  readLocalDisplay,
  readScheduleDeliveryState,
  resolveReminderFeishuTarget,
  scheduleChatDeliveryStateSchema,
  scheduleDeliveryStateSchema,
  scheduleFeishuDeliveryStateSchema,
  withChatDeliveryState,
  withFeishuDeliveryState,
};
