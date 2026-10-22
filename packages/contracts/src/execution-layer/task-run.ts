import { z } from "zod"

import { isoDateTimeSchema } from "../platform/common/base"

const taskRunStatusSchema = z.enum([
  "queued",
  "claimed",
  "running",
  "succeeded",
  "failed",
  "retry_scheduled",
  "cancelled",
])

const taskRunToolPolicySchema = z.object({
  toolAllowlist: z
    .array(z.string().trim().min(1))
    .max(128)
    .nullable()
    .default(null),
  timeoutMs: z.number().int().min(1).max(3_600_000).nullable().default(null),
  maxSteps: z.number().int().min(1).max(128).nullable().default(null),
})

// This is a compatibility projection, not an execution authorization. It gives
// legacy scheduler work the same stable identity an action run will eventually use.
const scheduledTaskActionProjectionSchema = z.object({
  operation: z.literal("scheduled_task_execution"),
  idempotencyKey: z.string().trim().min(1).max(256),
  scheduleId: z.string().trim().min(1),
  scheduledFor: isoDateTimeSchema,
  promptSnapshot: z.string().trim().min(1),
  toolPolicySnapshot: taskRunToolPolicySchema.nullable(),
  inputSnapshot: z.record(z.string(), z.unknown()).nullable(),
  requiresExternalReconciliation: z.boolean(),
})

const taskRunSchema = z.object({
  id: z.string().trim().min(1),
  profileId: z.string().trim().min(1),
  scheduleId: z.string().trim().min(1),
  status: taskRunStatusSchema,
  scheduledFor: isoDateTimeSchema,
  promptSnapshot: z.string().trim().min(1),
  toolPolicySnapshot: taskRunToolPolicySchema.nullable(),
  inputSnapshot: z.record(z.string(), z.unknown()).nullable(),
  attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  leaseOwner: z.string().trim().min(1).nullable(),
  leaseExpiresAt: isoDateTimeSchema.nullable(),
  heartbeatAt: isoDateTimeSchema.nullable(),
  nextRetryAt: isoDateTimeSchema.nullable(),
  runtimeTurnId: z.string().trim().min(1).nullable(),
  result: z.record(z.string(), z.unknown()).nullable(),
  error: z.record(z.string(), z.unknown()).nullable(),
  createdAt: isoDateTimeSchema,
  startedAt: isoDateTimeSchema.nullable(),
  finishedAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema,
})

export {
  taskRunSchema,
  scheduledTaskActionProjectionSchema,
  taskRunStatusSchema,
  taskRunToolPolicySchema,
}

export type TaskRun = z.infer<typeof taskRunSchema>
export type TaskRunStatus = z.infer<typeof taskRunStatusSchema>
export type TaskRunToolPolicy = z.infer<typeof taskRunToolPolicySchema>
export type ScheduledTaskActionProjection = z.infer<
  typeof scheduledTaskActionProjectionSchema
>
