import type { ChatMiddleware, ModelMessage } from "@tanstack/ai";

import {
	abortProviderStream,
	classifyProviderStreamOutcome,
	errorProviderStream,
	finishProviderStream,
	getProviderSpanStatus,
	type ProviderStreamEvidence,
	recordProviderTextContribution,
	recordProviderToolActivity,
	toProviderStreamOutput,
} from "../providers/provider-stream-outcome";
import { previewMaybeText } from "./compile-provider-request";
import { serializeError } from "./runtime-observer";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseToolArguments = (rawArgs: string | null | undefined): unknown => {
	const normalized = rawArgs?.trim() || "{}";

	try {
		const parsed = JSON.parse(normalized);
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {
			raw: normalized,
			parseError: true,
		};
	}
};

const readToolResultError = (result: unknown): string | null =>
	isRecord(result) && typeof result.error === "string" ? result.error : null;

type RuntimeMiddlewareObserver = {
	startSpan: (
		stage: "provider_stream" | "tool_call",
		payload?: Record<string, unknown> | null
	) => Promise<{ id: string }>;
	completeSpan: (
		spanId: string,
		output?: Record<string, unknown> | null
	) => Promise<unknown>;
	failSpan: (
		spanId: string,
		error?: unknown,
		output?: Record<string, unknown> | null
	) => Promise<unknown>;
	recordToolCall: (input: { ok: boolean; toolName?: string }) => void;
};

const createRuntimeMiddleware = (input: {
	observer: RuntimeMiddlewareObserver;
	providerRequestInput: Record<string, unknown>;
	initialPersistedMessageCount: number;
	getAbortReason: () => unknown;
	getProviderStreamEvidence: () => ProviderStreamEvidence;
	setProviderStreamEvidence: (next: ProviderStreamEvidence) => void;
	setProviderTurnMessages: (next: ReadonlyArray<ModelMessage>) => void;
}) => {
	let providerSpanId: string | null = null;
	const toolSpanIds = new Map<string, string>();
	const finalizedToolCallIds = new Set<string>();

	const middleware: ChatMiddleware = {
		name: "runtime-observer",
		onStart: async () => {
			const span = await input.observer.startSpan("provider_stream", {
				...input.providerRequestInput,
			});
			providerSpanId = span.id;
		},
		onChunk: async (_, chunk) => {
			if (chunk.type === "TEXT_MESSAGE_CONTENT" && chunk.delta) {
				input.setProviderStreamEvidence(
					recordProviderTextContribution(input.getProviderStreamEvidence(), {
						delta: chunk.delta,
						timestampIso: new Date(chunk.timestamp ?? Date.now()).toISOString(),
					})
				);
			}

			return chunk;
		},
		onBeforeToolCall: async (_, hookCtx) => {
			input.setProviderStreamEvidence(
				recordProviderToolActivity(input.getProviderStreamEvidence())
			);
			const span = await input.observer.startSpan("tool_call", {
				toolName: hookCtx.toolName,
				toolCallId: hookCtx.toolCallId,
				args: hookCtx.args,
			});
			toolSpanIds.set(hookCtx.toolCallId, span.id);
		},
		onAfterToolCall: async (_, info) => {
			input.observer.recordToolCall({
				ok: info.ok,
				toolName: info.toolName,
			});
			finalizedToolCallIds.add(info.toolCallId);
			const spanId = toolSpanIds.get(info.toolCallId);

			if (!spanId) {
				return;
			}

			if (info.ok) {
				await input.observer.completeSpan(spanId, {
					toolName: info.toolName,
					toolCallId: info.toolCallId,
					durationMs: info.duration,
					result: info.result,
				});
			} else {
				await input.observer.failSpan(spanId, {
					toolName: info.toolName,
					toolCallId: info.toolCallId,
					durationMs: info.duration,
					error: serializeError(info.error),
				});
			}

			toolSpanIds.delete(info.toolCallId);
		},
		onToolPhaseComplete: async (_, info) => {
			await Promise.all(
				info.needsClientExecution.map(async (item) => {
					input.setProviderStreamEvidence(
						recordProviderToolActivity(input.getProviderStreamEvidence())
					);
					input.observer.recordToolCall({
						ok: true,
						toolName: item.toolName,
					});
					finalizedToolCallIds.add(item.toolCallId);
					const span = await input.observer.startSpan("tool_call", {
						toolName: item.toolName,
						toolCallId: item.toolCallId,
						args: item.input,
						execution: "client",
					});
					await input.observer.completeSpan(span.id, {
						toolName: item.toolName,
						toolCallId: item.toolCallId,
						execution: "client",
						status: "delegated_to_client",
					});
				})
			);

			await Promise.all(
				info.results
					.filter((item) => !finalizedToolCallIds.has(item.toolCallId))
					.map(async (item) => {
						finalizedToolCallIds.add(item.toolCallId);
						input.setProviderStreamEvidence(
							recordProviderToolActivity(input.getProviderStreamEvidence())
						);

						const toolCall = info.toolCalls.find(
							(candidate) => candidate.id === item.toolCallId
						);
						const rawArgs = toolCall?.function.arguments ?? null;
						const args = parseToolArguments(rawArgs);
						const errorMessage = readToolResultError(item.result);

						input.observer.recordToolCall({
							ok: !errorMessage,
							toolName: item.toolName,
						});

						const span = await input.observer.startSpan("tool_call", {
							toolName: item.toolName,
							toolCallId: item.toolCallId,
							rawArgs,
							args,
							execution: "server_pre_execution",
						});

						const output = {
							toolName: item.toolName,
							toolCallId: item.toolCallId,
							rawArgs,
							args,
							result: item.result,
							durationMs: item.duration ?? 0,
							execution: "server_pre_execution",
						};

						if (errorMessage) {
							await input.observer.failSpan(
								span.id,
								{
									toolName: item.toolName,
									toolCallId: item.toolCallId,
									message: errorMessage,
									stage: "input_validation",
								},
								output
							);
							return;
						}

						await input.observer.completeSpan(span.id, output);
					})
			);
		},
		onFinish: async (ctx, info) => {
			input.setProviderTurnMessages(
				ctx.messages.slice(input.initialPersistedMessageCount)
			);

			if (!providerSpanId) {
				return;
			}

			const evidence = finishProviderStream(input.getProviderStreamEvidence(), {
				finishReason: info.finishReason ?? null,
				durationMs: info.duration,
				contentLength: info.content.length,
				contentPreview: previewMaybeText(info.content, 1200),
				contentPreviewTruncated: info.content.length > 1200,
				usage: (info.usage ?? null) as Record<string, unknown> | null,
			});
			const outcome = classifyProviderStreamOutcome(evidence);
			input.setProviderStreamEvidence(evidence);

			if (getProviderSpanStatus(outcome) === "failed") {
				await input.observer.failSpan(providerSpanId, {
					...toProviderStreamOutput(evidence, outcome),
					error: evidence.error,
				});
				return;
			}

			await input.observer.completeSpan(
				providerSpanId,
				toProviderStreamOutput(evidence, outcome)
			);
		},
		onAbort: async (_, info) => {
			if (!providerSpanId) {
				return;
			}

			const evidence = abortProviderStream(input.getProviderStreamEvidence(), {
				durationMs: info.duration,
				reason: info.reason ?? input.getAbortReason(),
			});
			const outcome = classifyProviderStreamOutcome(evidence);
			input.setProviderStreamEvidence(evidence);

			await input.observer.completeSpan(
				providerSpanId,
				toProviderStreamOutput(evidence, outcome)
			);
		},
		onError: async (_, info) => {
			if (!providerSpanId) {
				return;
			}

			const serializedError = serializeError(info.error);
			const evidence = errorProviderStream(input.getProviderStreamEvidence(), {
				durationMs: info.duration,
				error: serializedError,
			});
			const outcome = classifyProviderStreamOutcome(evidence);
			input.setProviderStreamEvidence(evidence);

			await input.observer.failSpan(providerSpanId, {
				...toProviderStreamOutput(evidence, outcome),
				error: serializedError,
			});
		},
	};

	return [middleware];
};

export { createRuntimeMiddleware };
