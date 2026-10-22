import { z } from "zod";

import { idSchema, isoDateTimeSchema } from "../platform/common/base";
import { runtimeSpanSchema, runtimeTurnSchema } from "./turn";

const runtimeRecentActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const runtimeRecentActivitySchema = z.object({
  runningTurns: z.array(runtimeTurnSchema),
  recentProblemTurns: z.array(runtimeTurnSchema),
  recentFailedSpans: z.array(runtimeSpanSchema),
});

const discordGatewaySidecarSessionStatusSchema = z.enum([
  "running",
  "degraded",
]);

const discordGatewaySidecarReconcileStatusSchema = z.enum([
  "idle",
  "ok",
  "error",
]);

const discordGatewaySidecarHeartbeatSchema = z.object({
  enabled: z.boolean(),
  startedAt: isoDateTimeSchema,
  observedAt: isoDateTimeSchema,
  heartbeatIntervalMs: z.number().int().min(1),
  reconcileIntervalMs: z.number().int().min(1),
  lastReconcileAt: isoDateTimeSchema.nullable(),
  lastReconcileStatus: discordGatewaySidecarReconcileStatusSchema,
  lastReconcileErrorMessage: z.string().trim().min(1).nullable(),
  sessions: z.array(
    z.object({
      profileId: idSchema,
      appId: idSchema,
      status: discordGatewaySidecarSessionStatusSchema,
      startedAt: isoDateTimeSchema,
      lastEventAt: isoDateTimeSchema.nullable(),
      lastRelayAt: isoDateTimeSchema.nullable(),
      lastErrorAt: isoDateTimeSchema.nullable(),
      lastErrorMessage: z.string().trim().min(1).nullable(),
    })
  ),
});

const discordGatewaySidecarOpsStatusSchema = z.enum([
  "healthy",
  "degraded",
  "down",
  "disabled",
]);

const discordGatewaySidecarOpsSchema = z.object({
  status: discordGatewaySidecarOpsStatusSchema,
  stale: z.boolean(),
  heartbeatAgeMs: z.number().int().min(0).nullable(),
  staleAfterMs: z.number().int().min(1).nullable(),
  heartbeat: discordGatewaySidecarHeartbeatSchema.nullable(),
});

export {
  discordGatewaySidecarHeartbeatSchema,
  discordGatewaySidecarOpsSchema,
  discordGatewaySidecarOpsStatusSchema,
  discordGatewaySidecarReconcileStatusSchema,
  discordGatewaySidecarSessionStatusSchema,
  runtimeRecentActivityQuerySchema,
  runtimeRecentActivitySchema,
};

export type DiscordGatewaySidecarHeartbeat = z.infer<
  typeof discordGatewaySidecarHeartbeatSchema
>;
export type DiscordGatewaySidecarOps = z.infer<
  typeof discordGatewaySidecarOpsSchema
>;
export type DiscordGatewaySidecarOpsStatus = z.infer<
  typeof discordGatewaySidecarOpsStatusSchema
>;
export type DiscordGatewaySidecarReconcileStatus = z.infer<
  typeof discordGatewaySidecarReconcileStatusSchema
>;
export type DiscordGatewaySidecarSessionStatus = z.infer<
  typeof discordGatewaySidecarSessionStatusSchema
>;
export type RuntimeRecentActivity = z.infer<typeof runtimeRecentActivitySchema>;
export type RuntimeRecentActivityQuery = z.infer<
  typeof runtimeRecentActivityQuerySchema
>;
