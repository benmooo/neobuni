import { z } from "zod";

const signalStrengthSchema = z.number().min(0).max(1);
const signalMetadataSchema = z.record(z.string(), z.unknown());

const textSignalKindSchema = z.enum([
  "support_request",
  "reflection_request",
  "planning_request",
  "warmth",
  "distress",
  "explicit_memory_reference",
  "topic_continuity",
]);

const memorySignalKindSchema = z.enum([
  "unresolved_overlap",
  "recent_overlap",
  "personal_history_candidate",
  "relationship_candidate",
]);

const scheduleSignalKindSchema = z.enum([
  "upcoming_commitment",
  "schedule_disruption",
  "missed_commitment",
  "time_pressure",
]);

const behavioralSignalKindSchema = z.enum([
  "negative_trend",
  "withdrawal_pattern",
  "routine_shift",
  "initiative_drop",
]);

const environmentalSignalKindSchema = z.enum([
  "time_context",
  "location_context",
  "device_context",
  "ambient_context",
]);

const textSignalSchema = z.object({
  kind: textSignalKindSchema,
  score: signalStrengthSchema,
  evidence: z.string().trim().min(1).optional(),
  metadata: signalMetadataSchema,
});

const memorySignalSchema = z.object({
  kind: memorySignalKindSchema,
  score: signalStrengthSchema,
  memoryIds: z.array(z.string()),
  metadata: signalMetadataSchema,
});

const scheduleSignalSchema = z.object({
  kind: scheduleSignalKindSchema,
  score: signalStrengthSchema,
  scheduleIds: z.array(z.string()),
  metadata: signalMetadataSchema,
});

const behavioralSignalSchema = z.object({
  kind: behavioralSignalKindSchema,
  score: signalStrengthSchema,
  evidenceWindow: z.string().trim().min(1).optional(),
  metadata: signalMetadataSchema,
});

const environmentalSignalSchema = z.object({
  kind: environmentalSignalKindSchema,
  score: signalStrengthSchema,
  metadata: signalMetadataSchema,
});

const signalSchema = z.union([
  textSignalSchema,
  memorySignalSchema,
  scheduleSignalSchema,
  behavioralSignalSchema,
  environmentalSignalSchema,
]);

const signalSetSchema = z.object({
  textSignals: z.array(textSignalSchema),
  memorySignals: z.array(memorySignalSchema),
  scheduleSignals: z.array(scheduleSignalSchema),
  behavioralSignals: z.array(behavioralSignalSchema),
  environmentalSignals: z.array(environmentalSignalSchema),
});

export {
  behavioralSignalKindSchema,
  behavioralSignalSchema,
  environmentalSignalKindSchema,
  environmentalSignalSchema,
  memorySignalKindSchema,
  memorySignalSchema,
  scheduleSignalKindSchema,
  scheduleSignalSchema,
  signalMetadataSchema,
  signalSchema,
  signalSetSchema,
  signalStrengthSchema,
  textSignalKindSchema,
  textSignalSchema,
};

export type BehavioralSignal = z.infer<typeof behavioralSignalSchema>;
export type BehavioralSignalKind = z.infer<typeof behavioralSignalKindSchema>;
export type EnvironmentalSignal = z.infer<typeof environmentalSignalSchema>;
export type EnvironmentalSignalKind = z.infer<typeof environmentalSignalKindSchema>;
export type MemorySignal = z.infer<typeof memorySignalSchema>;
export type MemorySignalKind = z.infer<typeof memorySignalKindSchema>;
export type ScheduleSignal = z.infer<typeof scheduleSignalSchema>;
export type ScheduleSignalKind = z.infer<typeof scheduleSignalKindSchema>;
export type Signal = z.infer<typeof signalSchema>;
export type SignalSet = z.infer<typeof signalSetSchema>;
export type SignalMetadata = z.infer<typeof signalMetadataSchema>;
export type TextSignal = z.infer<typeof textSignalSchema>;
export type TextSignalKind = z.infer<typeof textSignalKindSchema>;
