import type {
  ListFeishuDeliveryLogsInput,
  ListFeishuDeliveryLogsOutput,
  ListFeishuTargetsOutput,
} from "@neobuni/contracts";
import { listEvents as listEventsFx, runRepo } from "@neobuni/db";

const listEvents = (...args: Parameters<typeof listEventsFx>) =>
  runRepo(listEventsFx(...args));

import { listFeishuTargets, previewReceiveId } from "./feishu";

const listFeishuDeliveryLogsFromRequest = async (input: {
  profileId: string;
  request: ListFeishuDeliveryLogsInput;
}): Promise<ListFeishuDeliveryLogsOutput> => {
  const rows = await listEvents(input.profileId);
  const filtered = rows
    .filter((event) => event.type === "tool.send_feishu_message")
    .filter(
      (event) =>
        input.request.targetAlias === undefined ||
        event.payload.targetAlias === input.request.targetAlias
    )
    .slice(0, input.request.limit ?? 20)
    .map((event) => ({
      sentAt: event.createdAt,
      eventType: event.type,
      targetAlias:
        typeof event.payload.targetAlias === "string"
          ? event.payload.targetAlias
          : null,
      receiveIdType:
        typeof event.payload.receiveIdType === "string"
          ? (event.payload
              .receiveIdType as ListFeishuDeliveryLogsOutput["items"][number]["receiveIdType"])
          : "chat_id",
      receiveIdPreview: previewReceiveId(
        typeof event.payload.receiveId === "string"
          ? event.payload.receiveId
          : "unknown"
      ),
      messageId:
        typeof event.payload.messageId === "string"
          ? event.payload.messageId
          : null,
      preview:
        typeof event.payload.preview === "string"
          ? event.payload.preview
          : "No preview available.",
      conversationId:
        typeof event.payload.conversationId === "string"
          ? event.payload.conversationId
          : null,
      turnId:
        typeof event.payload.turnId === "string" ? event.payload.turnId : null,
    }));

  return {
    count: filtered.length,
    items: filtered,
  };
};

const listFeishuTargetsFromRequest = async (input: {
  profileId: string;
}): Promise<ListFeishuTargetsOutput> => {
  const items = await listFeishuTargets(input.profileId);

  return {
    count: items.length,
    items,
  };
};

export { listFeishuDeliveryLogsFromRequest, listFeishuTargetsFromRequest };
