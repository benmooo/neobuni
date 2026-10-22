import { z } from "zod"

import { idSchema, isoDateTimeSchema } from "../common/base"

const runtimeDatabaseTargetSchema = z.object({
  reachable: z.boolean(),
  filePath: z.string().trim().min(1),
  fileExists: z.boolean(),
})

const runtimeVectorDatabaseStatusSchema = runtimeDatabaseTargetSchema.extend({
  extensionLoaded: z.boolean(),
  schemaReady: z.boolean(),
  tableQueryable: z.boolean(),
  tableExists: z.boolean(),
  expectedDimensions: z.number().int().min(0),
  actualDimensions: z.number().int().min(0).nullable(),
})

const runtimeDatabaseStatusSchema = z.object({
  overallReady: z.boolean(),
  main: runtimeDatabaseTargetSchema,
  vector: runtimeVectorDatabaseStatusSchema,
})

const runtimeProviderSummarySchema = z.object({
  configured: z.boolean(),
  enabled: z.boolean(),
  provider: z.string().trim().min(1).nullable(),
  protocol: z.string().trim().min(1).nullable(),
  model: z.string().trim().min(1).nullable(),
  baseUrl: z.string().trim().min(1).nullable(),
  hasApiKey: z.boolean(),
})

const runtimeProviderCheckSlotSchema = z.enum([
  "chat",
  "memory_embedding",
  "memory_reasoning",
])

const runtimeProviderCheckStatusSchema = z.enum(["pass", "fail", "skip"])

const runtimeProviderCheckSchema = z.object({
  slot: runtimeProviderCheckSlotSchema,
  status: runtimeProviderCheckStatusSchema,
  provider: z.string().trim().min(1).nullable(),
  model: z.string().trim().min(1).nullable(),
  checkedAt: isoDateTimeSchema,
  durationMs: z.number().int().min(0).nullable(),
  message: z.string().trim().min(1),
  detail: z.record(z.string(), z.unknown()).nullable(),
})

const runtimeProviderChecksSchema = z.object({
  checks: z.array(runtimeProviderCheckSchema),
})

const runtimeConfigSchema = z.object({
  profileId: idSchema,
  database: runtimeDatabaseStatusSchema,
  providers: z.object({
    chat: runtimeProviderSummarySchema,
    memoryEmbedding: runtimeProviderSummarySchema,
    memoryReasoning: runtimeProviderSummarySchema,
    decisionJev: runtimeProviderSummarySchema,
  }),
})

export {
  runtimeConfigSchema,
  runtimeDatabaseStatusSchema,
  runtimeDatabaseTargetSchema,
  runtimeProviderCheckSchema,
  runtimeProviderChecksSchema,
  runtimeProviderCheckSlotSchema,
  runtimeProviderCheckStatusSchema,
  runtimeProviderSummarySchema,
  runtimeVectorDatabaseStatusSchema,
}

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>
export type RuntimeDatabaseStatus = z.infer<typeof runtimeDatabaseStatusSchema>
export type RuntimeDatabaseTarget = z.infer<typeof runtimeDatabaseTargetSchema>
export type RuntimeProviderCheck = z.infer<typeof runtimeProviderCheckSchema>
export type RuntimeProviderChecks = z.infer<typeof runtimeProviderChecksSchema>
export type RuntimeProviderCheckSlot = z.infer<
  typeof runtimeProviderCheckSlotSchema
>
export type RuntimeProviderCheckStatus = z.infer<
  typeof runtimeProviderCheckStatusSchema
>
export type RuntimeProviderSummary = z.infer<
  typeof runtimeProviderSummarySchema
>
export type RuntimeVectorDatabaseStatus = z.infer<
  typeof runtimeVectorDatabaseStatusSchema
>
