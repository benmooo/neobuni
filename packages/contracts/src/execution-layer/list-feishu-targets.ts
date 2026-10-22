import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

import { feishuReceiveIdTypeSchema } from "./send-feishu-message";

const listFeishuTargetsInputSchema = z.object({});

const listFeishuTargetsOutputSchema = z.object({
  count: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      alias: z.string().trim().min(1),
      label: z.string().trim().min(1).nullable(),
      receiveIdType: feishuReceiveIdTypeSchema,
      receiveIdPreview: z.string().trim().min(1),
    }),
  ),
});

const listFeishuTargetsDef = toolDefinition({
  name: "list_feishu_targets",
  description:
    "List configured Feishu target aliases that Buni can send messages to through the current Feishu integration.",
  inputSchema: listFeishuTargetsInputSchema,
  outputSchema: listFeishuTargetsOutputSchema,
});

export {
  listFeishuTargetsDef,
  listFeishuTargetsInputSchema,
  listFeishuTargetsOutputSchema,
};

export type ListFeishuTargetsOutput = z.infer<
  typeof listFeishuTargetsOutputSchema
>;
