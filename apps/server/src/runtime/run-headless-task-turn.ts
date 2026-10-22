import type {
	PersistedMessage,
	ProviderPromptPacket,
	SurfacePolicy,
} from "@neobuni/contracts";
import { compilePromptPacket } from "@neobuni/core";

import {
	getAgentConfig as getAgentConfigFx,
	getProfile as getProfileFx,
	getProviderConfig as getProviderConfigFx,
	runRepo,
} from "@neobuni/db";

const getAgentConfig = (...args: Parameters<typeof getAgentConfigFx>) =>
	runRepo(getAgentConfigFx(...args));
const getProfile = (...args: Parameters<typeof getProfileFx>) =>
	runRepo(getProfileFx(...args));
const getProviderConfig = (...args: Parameters<typeof getProviderConfigFx>) =>
	runRepo(getProviderConfigFx(...args));

import { createExecutionTools } from "../tools";
import {
	buildProviderRequestInput,
	previewText,
} from "./compile-provider-request";
import { runAgentTurn } from "./run-agent-turn";
import { createRuntimeObserver } from "./runtime-observer";
import {
	filterToolNamesForSurfacePolicy,
	getSurfacePolicy,
} from "./surface-policy";

type HeadlessTaskTurnResult = {
	runtimeTurnId: string;
	assistantText: string;
	providerOutcome: string;
	transcript: Record<string, unknown> | null;
};

const buildHeadlessPromptPacket = (input: {
	aiName: string;
	userName: string;
	userPersona: string;
	surfacePolicy: SurfacePolicy;
}): ProviderPromptPacket => {
	const promptLines = [
		input.userPersona,
		"Execution mode: detached scheduled task runner.",
		"You are executing a background task automatically.",
		"Use available tools to complete the task directly.",
		"Do not ask follow-up questions unless the task is impossible with the current tools and context.",
		"If the task requires sending a result to chat or Feishu, call the delivery tool yourself.",
		"Be precise and truthful about what tools actually did.",
		input.surfacePolicy.responseVisibility === "group"
			? "Response visibility: group-safe public surface."
			: null,
	].filter(
		(value): value is string => value !== null && value.trim().length > 0
	);

	return compilePromptPacket({
		aiName: input.aiName,
		userName: input.userName,
		userPersona: promptLines.join("\n"),
	});
};

const buildTaskPromptMessage = (input: {
	taskRunId: string;
	prompt: string;
	nowIso: string;
}): PersistedMessage => ({
	id: `${input.taskRunId}:prompt`,
	role: "user",
	content: input.prompt,
	metadata: {
		source: "task_run",
	},
	createdAt: input.nowIso,
});

const filterToolsByAllowlist = <T extends { name: string }>(
	tools: readonly T[],
	allowlist: readonly string[] | null
) => {
	if (allowlist === null || allowlist.length === 0) {
		return [...tools];
	}

	const allowed = new Set(allowlist);
	return tools.filter((tool) => allowed.has(tool.name));
};

const runHeadlessTaskTurn = async (input: {
	profileId: string;
	taskRunId: string;
	prompt: string;
	toolAllowlist: string[] | null;
	timeoutMs: number;
	maxSteps?: number | null;
	clientTimezone?: string | null;
	conversationId?: string | null;
	surfacePolicy?: SurfacePolicy | null;
	onTurnCreated?: (turnId: string) => Promise<void> | void;
}): Promise<HeadlessTaskTurnResult> => {
	const effectiveSurfacePolicy =
		input.surfacePolicy ?? getSurfacePolicy("task_run_private");
	const [agentConfig, profile, providerConfig] = await Promise.all([
		getAgentConfig(input.profileId),
		getProfile(input.profileId),
		getProviderConfig(input.profileId),
	]);

	const abortController = new AbortController();
	const timeoutHandle = setTimeout(() => {
		abortController.abort(
			new Error(`Headless task turn timed out after ${input.timeoutMs}ms`)
		);
	}, input.timeoutMs);

	const observer = await createRuntimeObserver({
		profileId: input.profileId,
		conversationId: input.conversationId ?? null,
		providerKey: providerConfig.provider,
		modelKey: providerConfig.model,
		executionSource: "task_run",
		taskRunId: input.taskRunId,
	});
	let turnSettled = false;

	try {
		await input.onTurnCreated?.(observer.turnId);

		const promptPacket = buildHeadlessPromptPacket({
			aiName: agentConfig.aiName,
			userName: agentConfig.userName,
			userPersona: agentConfig.userPersona,
			surfacePolicy: effectiveSurfacePolicy,
		});
		const persistedMessages = [
			buildTaskPromptMessage({
				taskRunId: input.taskRunId,
				prompt: input.prompt,
				nowIso: new Date().toISOString(),
			}),
		];

		const toolContext = {
			profileId: input.profileId,
			conversationId: input.conversationId ?? null,
			turnId: observer.turnId,
			clientTimezone: input.clientTimezone ?? null,
			profileTimezone: profile?.timezone ?? null,
			defaultTimezone:
				Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
			referenceNow: new Date().toISOString(),
			embeddingConfig: null,
			abortSignal: abortController.signal,
		} as const;

		const executionTools = createExecutionTools(toolContext);
		const effectiveToolAllowlist = filterToolNamesForSurfacePolicy(
			input.toolAllowlist ?? executionTools.map((tool) => tool.name),
			effectiveSurfacePolicy
		);
		const tools = filterToolsByAllowlist(
			executionTools,
			effectiveToolAllowlist
		);

		const requestSpan = await observer.startSpan("request_received", {
			taskRunId: input.taskRunId,
			inputPreview: previewText(input.prompt),
			executionSource: "task_run",
		});
		await observer.completeSpan(requestSpan.id, {
			accepted: true,
		});

		const promptCompileSpan = await observer.startSpan("prompt_compile", {
			taskRunId: input.taskRunId,
			toolCount: tools.length,
		});
		await observer.completeSpan(promptCompileSpan.id, {
			systemPromptLength: promptPacket.systemPrompt.length,
			promptSectionCount: promptPacket.sections.length,
			toolNames: tools.map((tool) => tool.name),
		});

		const result = await runAgentTurn({
			observer,
			abortController,
			providerConfig,
			conversationId: input.conversationId ?? null,
			threadId: input.taskRunId,
			promptPacket,
			persistedMessages,
			tools,
			providerRequestInput: buildProviderRequestInput({
				providerKey: providerConfig.provider,
				modelKey: providerConfig.model,
				persistedMessages,
				promptPacket,
				toolNames: tools.map((tool) => tool.name),
			}),
			initialPersistedMessageCount: persistedMessages.length,
		});

		if (result.providerTurnResolution.status === "aborted") {
			turnSettled = true;
			await observer.abortTurn(result.providerTurnResolution.error);
			const error = result.providerTurnResolution.error;
			throw error instanceof Error
				? error
				: new Error("Headless task turn aborted.");
		}

		if (result.providerTurnResolution.status === "failed") {
			turnSettled = true;
			await observer.failTurn(
				result.providerTurnResolution.errorCode,
				result.providerTurnResolution.error
			);
			const error = result.providerTurnResolution.error;
			throw error instanceof Error
				? error
				: new Error(result.providerTurnResolution.errorCode);
		}

		turnSettled = true;
		await observer.completeTurn();

		return {
			runtimeTurnId: observer.turnId,
			assistantText: result.assistantText,
			providerOutcome: result.providerTurnResolution.providerOutcome,
			transcript: result.transcript,
		};
	} catch (error) {
		if (!turnSettled) {
			turnSettled = true;

			if (abortController.signal.aborted) {
				await observer.abortTurn(error);
			} else {
				await observer.failTurn("task_run_failed", error);
			}
		}
		throw error;
	} finally {
		clearTimeout(timeoutHandle);
	}
};

export { runHeadlessTaskTurn };
