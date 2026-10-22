import { z } from "zod";
import { idSchema } from "../platform/common/base";
import { runtimeSpanSchema, runtimeTurnSchema } from "../runtime/turn";
import { scheduleSchema } from "./schedule";
import { taskRunSchema } from "./task-run";

const taskRunSummarySchema = taskRunSchema.pick({
  id: true,
  scheduleId: true,
  status: true,
  scheduledFor: true,
  attempt: true,
  maxAttempts: true,
  runtimeTurnId: true,
  nextRetryAt: true,
  error: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  updatedAt: true,
});

const scheduleListItemSchema = scheduleSchema.extend({
  latestTaskRun: taskRunSummarySchema.nullable(),
});

const scheduleParamSchema = z.object({
  scheduleId: idSchema,
});

const scheduleTaskRunListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const taskRunParamSchema = z.object({
  taskRunId: idSchema,
});

const taskRunTraceSchema = z.object({
  taskRun: taskRunSchema,
  runtimeTurn: runtimeTurnSchema.nullable(),
  spans: z.array(runtimeSpanSchema),
});

export {
  scheduleListItemSchema,
  scheduleParamSchema,
  scheduleTaskRunListQuerySchema,
  taskRunParamSchema,
  taskRunSummarySchema,
  taskRunTraceSchema,
};

export type ScheduleListItem = z.infer<typeof scheduleListItemSchema>;
export type TaskRunSummary = z.infer<typeof taskRunSummarySchema>;
export type TaskRunTrace = z.infer<typeof taskRunTraceSchema>;
