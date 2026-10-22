import {
	abortRuntimeTurn as abortRuntimeTurnFx,
	attachRuntimeTurnMessages as attachRuntimeTurnMessagesFx,
	completeRuntimeSpan as completeRuntimeSpanFx,
	completeRuntimeTurn as completeRuntimeTurnFx,
	createRuntimeSpan as createRuntimeSpanFx,
	createRuntimeTurn as createRuntimeTurnFx,
	failRuntimeSpan as failRuntimeSpanFx,
	failRuntimeTurn as failRuntimeTurnFx,
	runRepo,
	skipRuntimeSpan as skipRuntimeSpanFx,
} from "@neobuni/db";

const abortRuntimeTurn = (...args: Parameters<typeof abortRuntimeTurnFx>) =>
	runRepo(abortRuntimeTurnFx(...args));
const attachRuntimeTurnMessages = (
	...args: Parameters<typeof attachRuntimeTurnMessagesFx>
) => runRepo(attachRuntimeTurnMessagesFx(...args));
const completeRuntimeSpan = (
	...args: Parameters<typeof completeRuntimeSpanFx>
) => runRepo(completeRuntimeSpanFx(...args));
const completeRuntimeTurn = (
	...args: Parameters<typeof completeRuntimeTurnFx>
) => runRepo(completeRuntimeTurnFx(...args));
const createRuntimeSpan = (...args: Parameters<typeof createRuntimeSpanFx>) =>
	runRepo(createRuntimeSpanFx(...args));
const createRuntimeTurn = (...args: Parameters<typeof createRuntimeTurnFx>) =>
	runRepo(createRuntimeTurnFx(...args));
const failRuntimeSpan = (...args: Parameters<typeof failRuntimeSpanFx>) =>
	runRepo(failRuntimeSpanFx(...args));
const failRuntimeTurn = (...args: Parameters<typeof failRuntimeTurnFx>) =>
	runRepo(failRuntimeTurnFx(...args));
const skipRuntimeSpan = (...args: Parameters<typeof skipRuntimeSpanFx>) =>
	runRepo(skipRuntimeSpanFx(...args));

import type { runtimeStageSchema } from "@neobuni/contracts";
import type { z } from "zod";

type RuntimeStage = z.infer<typeof runtimeStageSchema>;

type RuntimeSummary = {
	protectiveLevel: number | null;
	primaryStance: string | null;
	memoryCount: number;
	memoryRecallStrategy: "pre_recall" | "tool_fallback" | "skip" | null;
	preRecallCount: number;
	toolCallCount: number;
	hadToolFailures: boolean;
	hadToolRecall: boolean;
	requestMessageId: string | null;
	responseMessageId: string | null;
};

type ActiveSpan = {
	id: string;
	stage: RuntimeStage;
	seq: number;
};

const serializeError = (error: unknown): Record<string, unknown> => {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
		};
	}

	if (typeof error === "object" && error !== null) {
		return error as Record<string, unknown>;
	}

	return {
		message: String(error),
	};
};

const createRuntimeObserver = async (input: {
	profileId: string;
	conversationId?: string | null;
	providerKey: string;
	modelKey: string;
	executionSource?: "chat" | "task_run";
	taskRunId?: string | null;
}) => {
	const turn = await createRuntimeTurn(input);

	let nextSeq = 0;
	const activeSpans = new Map<string, ActiveSpan>();
	let summary: RuntimeSummary = {
		protectiveLevel: null,
		primaryStance: null,
		memoryCount: 0,
		memoryRecallStrategy: null,
		preRecallCount: 0,
		toolCallCount: 0,
		hadToolFailures: false,
		hadToolRecall: false,
		requestMessageId: null,
		responseMessageId: null,
	};

	const rememberSpan = <T extends { id: string; stage: string; seq: number }>(
		span: T
	) => {
		activeSpans.set(span.id, {
			id: span.id,
			stage: span.stage as RuntimeStage,
			seq: span.seq,
		});

		return span;
	};

	const startSpan = async (
		stage: RuntimeStage,
		payload?: Record<string, unknown> | null
	) =>
		rememberSpan(
			await createRuntimeSpan({
				turnId: turn.id,
				conversationId: input.conversationId ?? null,
				stage,
				seq: nextSeq++,
				payload,
			})
		);

	const completeSpan = async (
		spanId: string,
		output?: Record<string, unknown> | null
	) => {
		const span = await completeRuntimeSpan(spanId, output);
		activeSpans.delete(spanId);
		return span;
	};

	const failSpan = async (
		spanId: string,
		error?: unknown,
		output?: Record<string, unknown> | null
	) => {
		const span = await failRuntimeSpan(
			spanId,
			error ? serializeError(error) : null,
			output
		);
		activeSpans.delete(spanId);
		return span;
	};

	const skipSpan = async (
		spanId: string,
		output?: Record<string, unknown> | null
	) => {
		const span = await skipRuntimeSpan(spanId, output);
		activeSpans.delete(spanId);
		return span;
	};

	const skipStage = async (
		stage: RuntimeStage,
		payload?: Record<string, unknown> | null,
		output?: Record<string, unknown> | null
	) => {
		const span = await startSpan(stage, payload);
		await skipSpan(span.id, output);
		return span;
	};

	const settleActiveSpans = async (
		status: "completed" | "failed" | "aborted",
		input?: {
			errorCode?: string;
			error?: unknown;
		}
	) => {
		const spans = [...activeSpans.values()].sort(
			(left, right) => left.seq - right.seq
		);

		for (const span of spans) {
			if (!activeSpans.has(span.id)) {
				continue;
			}

			if (status === "failed") {
				await failSpan(span.id, {
					autoClosed: true,
					turnStatus: status,
					errorCode: input?.errorCode ?? "runtime_error",
					error: input?.error ? serializeError(input.error) : undefined,
				});
				continue;
			}

			await completeSpan(span.id, {
				autoClosed: true,
				turnStatus: status,
				...(status === "aborted"
					? {
							aborted: true,
							errorCode: input?.errorCode ?? "aborted",
							error: input?.error ? serializeError(input.error) : undefined,
						}
					: {
							reason: "turn_completed_cleanup",
						}),
			});
		}
	};

	const updateSummary = (patch: Partial<RuntimeSummary>) => {
		summary = {
			...summary,
			...patch,
		};
	};

	const recordToolCall = (input: { ok: boolean; toolName?: string }) => {
		summary = {
			...summary,
			toolCallCount: summary.toolCallCount + 1,
			hadToolFailures: summary.hadToolFailures || !input.ok,
			hadToolRecall:
				summary.hadToolRecall || input.toolName === "recall_memory",
		};
	};

	const recordPreRecall = (
		strategy: "pre_recall" | "tool_fallback" | "skip"
	) => {
		summary = {
			...summary,
			memoryRecallStrategy: strategy,
			preRecallCount:
				strategy === "pre_recall"
					? summary.preRecallCount + 1
					: summary.preRecallCount,
		};
	};

	const setRequestMessageId = async (messageId: string) => {
		updateSummary({ requestMessageId: messageId });
		await attachRuntimeTurnMessages(turn.id, {
			requestMessageId: messageId,
		});
	};

	const setResponseMessageId = async (messageId: string) => {
		updateSummary({ responseMessageId: messageId });
		await attachRuntimeTurnMessages(turn.id, {
			responseMessageId: messageId,
		});
	};

	const finalizeTurn = async (
		status: "completed" | "failed" | "aborted",
		input?: {
			errorCode?: string;
			error?: unknown;
		}
	) => {
		await settleActiveSpans(status, input);

		const span = await startSpan("turn_finalize", {
			status,
			memoryRecallStrategy: summary.memoryRecallStrategy,
			preRecallCount: summary.preRecallCount,
			toolCallCount: summary.toolCallCount,
			hadToolFailures: summary.hadToolFailures,
			hadToolRecall: summary.hadToolRecall,
		});

		const output = {
			status,
			memoryRecallStrategy: summary.memoryRecallStrategy,
			preRecallCount: summary.preRecallCount,
			toolCallCount: summary.toolCallCount,
			hadToolFailures: summary.hadToolFailures,
			hadToolRecall: summary.hadToolRecall,
			protectiveLevel: summary.protectiveLevel,
			primaryStance: summary.primaryStance,
			memoryCount: summary.memoryCount,
		};

		if (status === "completed") {
			await completeRuntimeTurn(turn.id, {
				protectiveLevel: summary.protectiveLevel,
				primaryStance: summary.primaryStance,
				memoryCount: summary.memoryCount,
				memoryRecallStrategy: summary.memoryRecallStrategy,
				preRecallCount: summary.preRecallCount,
				toolCallCount: summary.toolCallCount,
				hadToolFailures: summary.hadToolFailures,
				hadToolRecall: summary.hadToolRecall,
			});
			await completeSpan(span.id, output);
			return;
		}

		if (status === "aborted") {
			await abortRuntimeTurn(turn.id, {
				error: input?.error ? serializeError(input.error) : undefined,
				memoryRecallStrategy: summary.memoryRecallStrategy,
				preRecallCount: summary.preRecallCount,
				toolCallCount: summary.toolCallCount,
				hadToolFailures: summary.hadToolFailures,
				hadToolRecall: summary.hadToolRecall,
			});
			await completeSpan(span.id, {
				...output,
				errorCode: input?.errorCode ?? "aborted",
			});
			return;
		}

		await failRuntimeTurn(turn.id, {
			errorCode: input?.errorCode ?? "runtime_error",
			error: input?.error ? serializeError(input.error) : {},
			protectiveLevel: summary.protectiveLevel,
			primaryStance: summary.primaryStance,
			memoryCount: summary.memoryCount,
			memoryRecallStrategy: summary.memoryRecallStrategy,
			preRecallCount: summary.preRecallCount,
			toolCallCount: summary.toolCallCount,
			hadToolFailures: summary.hadToolFailures,
			hadToolRecall: summary.hadToolRecall,
		});
		await completeSpan(span.id, {
			...output,
			errorCode: input?.errorCode ?? "runtime_error",
		});
	};

	return {
		turnId: turn.id,
		startSpan,
		completeSpan,
		failSpan,
		skipStage,
		updateSummary,
		recordPreRecall,
		recordToolCall,
		setRequestMessageId,
		setResponseMessageId,
		completeTurn: () => finalizeTurn("completed"),
		abortTurn: (error?: unknown) =>
			finalizeTurn("aborted", { errorCode: "aborted", error }),
		failTurn: (errorCode: string, error?: unknown) =>
			finalizeTurn("failed", { errorCode, error }),
	};
};

export { createRuntimeObserver, serializeError };
