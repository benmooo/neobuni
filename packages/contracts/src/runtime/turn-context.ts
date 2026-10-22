import { z } from "zod";

import { memorySliceSchema } from "../cognition-layer/memory-system";
import { isoDateTimeSchema } from "../platform/common/base";
import { signalSetSchema } from "./signal";
import { runtimeTurnStatusSchema } from "./turn";

const turnInputSchema = z.object({
  profileId: z.string().trim().min(1),
  conversationId: z.string().trim().min(1),
  latestUserText: z.string(),
  timezone: z.string().trim().min(1).nullable(),
  now: z.string().datetime(),
});

const previousRuntimeStateSchema = z.object({
  protectiveLevel: z.number().int().min(0).max(3).nullable(),
  primaryStance: z.string().nullable(),
  memoryRecallStrategy: z.enum(["pre_recall", "tool_fallback", "skip"]).nullable(),
});

const scheduleSignalInputSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(["reminder", "alarm", "monitor"]),
  title: z.string().trim().min(1),
  triggerAt: isoDateTimeSchema.nullable(),
  timezone: z.string().trim().min(1),
  status: z.enum(["active", "paused", "completed", "cancelled"]),
});

const runtimeTurnSignalInputSchema = z.object({
  id: z.string().trim().min(1),
  status: runtimeTurnStatusSchema,
  protectiveLevel: z.number().int().min(0).max(3).nullable(),
  primaryStance: z.string().nullable(),
  memoryRecallStrategy: z.enum(["pre_recall", "tool_fallback", "skip"]).nullable(),
  toolCallCount: z.number().int().nonnegative(),
  startedAt: isoDateTimeSchema,
});

const signalContextEnvironmentSchema = z.object({
  effectiveTimezone: z.string().trim().min(1),
});

const signalContextSchema = z.object({
  schedules: z.array(scheduleSignalInputSchema),
  recentRuntimeTurns: z.array(runtimeTurnSignalInputSchema),
  environment: signalContextEnvironmentSchema,
});

const turnContextSchema = z.object({
  input: turnInputSchema,
  recentUserTexts: z.array(z.string()),
  signals: signalSetSchema,
  signalContext: signalContextSchema,
  unresolvedSlices: z.array(memorySliceSchema),
  recentSlices: z.array(memorySliceSchema),
  previousRuntimeState: previousRuntimeStateSchema.nullable(),
});

export {
  previousRuntimeStateSchema,
  runtimeTurnSignalInputSchema,
  scheduleSignalInputSchema,
  signalContextEnvironmentSchema,
  signalContextSchema,
  turnContextSchema,
  turnInputSchema,
};

export type PreviousRuntimeState = z.infer<typeof previousRuntimeStateSchema>;
export type RuntimeTurnSignalInput = z.infer<typeof runtimeTurnSignalInputSchema>;
export type ScheduleSignalInput = z.infer<typeof scheduleSignalInputSchema>;
export type SignalContext = z.infer<typeof signalContextSchema>;
export type SignalContextEnvironment = z.infer<typeof signalContextEnvironmentSchema>;
export type TurnContext = z.infer<typeof turnContextSchema>;
export type TurnInput = z.infer<typeof turnInputSchema>;
