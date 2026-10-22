import { z } from "zod";

import { idSchema, isoDateTimeSchema } from "../platform/common/base";

const runtimeTurnStatusSchema = z.enum([
	"running",
	"completed",
	"failed",
	"aborted",
]);
const runtimeExecutionSourceSchema = z.enum(["chat", "task_run"]);

const runtimeSpanStatusSchema = z.enum([
	"running",
	"completed",
	"failed",
	"skipped",
]);

const runtimeStageSchema = z.enum([
	"request_received",
	"user_message_persist",
	"turn_context_load",
	"goal_context_load",
	"signal_normalization",
	"retrieval_signals",
	"retrieval_plan",
	"temporal_recall",
	"graph_recall",
	"knowledge_recall",
	"evidence_fusion",
	"working_memory_build",
	"soul_runtime",
	"soul_decision",
	"response_spec_build",
	"prompt_build",
	"prompt_compile",
	"provider_stream",
	"tool_call",
	"assistant_message_persist",
	"turn_finalize",
]);

const jsonRecordSchema = z.record(z.string(), z.unknown());

const runtimeTurnSchema = z.object({
	id: idSchema,
	profileId: idSchema,
	conversationId: idSchema.nullable(),
	executionSource: runtimeExecutionSourceSchema,
	taskRunId: idSchema.nullable(),
	requestMessageId: idSchema.nullable(),
	responseMessageId: idSchema.nullable(),
	status: runtimeTurnStatusSchema,
	startedAt: isoDateTimeSchema,
	endedAt: isoDateTimeSchema.nullable(),
	durationMs: z.number().int().nonnegative().nullable(),
	providerKey: z.string(),
	modelKey: z.string(),
	protectiveLevel: z.number().int().min(0).max(3).nullable(),
	primaryStance: z.string().nullable(),
	memoryCount: z.number().int().nonnegative(),
	memoryRecallStrategy: z
		.enum(["pre_recall", "tool_fallback", "skip"])
		.nullable(),
	preRecallCount: z.number().int().nonnegative(),
	toolCallCount: z.number().int().nonnegative(),
	hadToolFailures: z.boolean(),
	hadToolRecall: z.boolean(),
	errorCode: z.string().nullable(),
	errorJson: jsonRecordSchema.nullable(),
	createdAt: isoDateTimeSchema,
	updatedAt: isoDateTimeSchema,
});

const runtimeSpanSchema = z.object({
	id: idSchema,
	turnId: idSchema,
	conversationId: idSchema.nullable(),
	stage: runtimeStageSchema,
	seq: z.number().int().nonnegative(),
	status: runtimeSpanStatusSchema,
	startedAt: isoDateTimeSchema,
	endedAt: isoDateTimeSchema.nullable(),
	durationMs: z.number().int().nonnegative().nullable(),
	input: jsonRecordSchema.nullable(),
	output: jsonRecordSchema.nullable(),
	error: jsonRecordSchema.nullable(),
});

const runtimeTurnListQuerySchema = z.object({
	conversationId: idSchema,
});

const runtimeTurnParamSchema = z.object({
	turnId: idSchema,
});

export {
	runtimeExecutionSourceSchema,
	runtimeSpanSchema,
	runtimeSpanStatusSchema,
	runtimeStageSchema,
	runtimeTurnListQuerySchema,
	runtimeTurnParamSchema,
	runtimeTurnSchema,
	runtimeTurnStatusSchema,
};
