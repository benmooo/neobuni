type ProviderContributionKind = "text" | "tool_activity";

type ProviderStreamEndKind = "finish" | "abort" | "error";

type ProviderStreamEvidence = {
	contributionKinds: ProviderContributionKind[];
	textCharCount: number;
	toolCallCount: number;
	textPreview: string | null;
	textPreviewTruncated: boolean;
	firstTokenAt: string | null;
	finishReason: string | null;
	usage: Record<string, unknown> | null;
	endedBy: ProviderStreamEndKind | null;
	durationMs: number | null;
	contentLength: number;
	abortReason: string | null;
	error: Record<string, unknown> | null;
};

type ProviderStreamOutcome =
	| "text"
	| "tool_only"
	| "empty"
	| "aborted"
	| "error";

type ProviderTurnResolution =
	| {
			providerOutcome: "text" | "tool_only";
			status: "completed";
	  }
	| {
			providerOutcome: "aborted";
			status: "aborted";
			errorCode: "aborted";
			error: Record<string, unknown>;
	  }
	| {
			providerOutcome: "empty";
			status: "failed";
			errorCode: "empty_provider_response";
			error: Record<string, unknown>;
	  }
	| {
			providerOutcome: "error";
			status: "failed";
			errorCode: "provider_stream_failed";
			error: Record<string, unknown>;
	  };

const appendContributionKind = (
	kinds: ProviderContributionKind[],
	nextKind: ProviderContributionKind
) => (kinds.includes(nextKind) ? kinds : [...kinds, nextKind]);

const createProviderStreamEvidence = (): ProviderStreamEvidence => ({
	contributionKinds: [],
	textCharCount: 0,
	toolCallCount: 0,
	textPreview: null,
	textPreviewTruncated: false,
	firstTokenAt: null,
	finishReason: null,
	usage: null,
	endedBy: null,
	durationMs: null,
	contentLength: 0,
	abortReason: null,
	error: null,
});

const PROVIDER_TEXT_PREVIEW_LIMIT = 1200;

const normalizeAbortReason = (reason: unknown) => {
	if (typeof reason === "string" && reason.trim().length > 0) {
		return reason;
	}

	if (reason instanceof Error) {
		return reason.message.trim().length > 0
			? `${reason.name}: ${reason.message}`
			: reason.name;
	}

	if (reason && typeof reason === "object" && "message" in reason) {
		const message = (reason as { message?: unknown }).message;
		if (typeof message === "string" && message.trim().length > 0) {
			return message;
		}
	}

	return "aborted";
};

const appendTextPreview = (current: string | null, delta: string) => {
	const existing = current ?? "";

	if (existing.length >= PROVIDER_TEXT_PREVIEW_LIMIT) {
		return {
			textPreview: existing,
			textPreviewTruncated: true,
		};
	}

	const remaining = PROVIDER_TEXT_PREVIEW_LIMIT - existing.length;
	const next = existing + delta.slice(0, remaining);

	return {
		textPreview: next,
		textPreviewTruncated: next.length < existing.length + delta.length,
	};
};

const recordProviderTextContribution = (
	evidence: ProviderStreamEvidence,
	input: {
		delta: string;
		timestampIso: string;
	}
): ProviderStreamEvidence => {
	const preview = appendTextPreview(evidence.textPreview, input.delta);

	return {
		...evidence,
		contributionKinds: appendContributionKind(
			evidence.contributionKinds,
			"text"
		),
		textCharCount: evidence.textCharCount + input.delta.length,
		textPreview: preview.textPreview,
		textPreviewTruncated:
			evidence.textPreviewTruncated || preview.textPreviewTruncated,
		firstTokenAt: evidence.firstTokenAt ?? input.timestampIso,
	};
};

const recordProviderToolActivity = (
	evidence: ProviderStreamEvidence
): ProviderStreamEvidence => ({
	...evidence,
	contributionKinds: appendContributionKind(
		evidence.contributionKinds,
		"tool_activity"
	),
	toolCallCount: evidence.toolCallCount + 1,
});

const finishProviderStream = (
	evidence: ProviderStreamEvidence,
	input: {
		finishReason: string | null;
		durationMs: number;
		contentLength: number;
		contentPreview?: string | null;
		contentPreviewTruncated?: boolean;
		usage: Record<string, unknown> | null;
	}
): ProviderStreamEvidence => ({
	...evidence,
	endedBy: "finish",
	finishReason: input.finishReason,
	durationMs: input.durationMs,
	contentLength: input.contentLength,
	textPreview: input.contentPreview ?? evidence.textPreview,
	textPreviewTruncated:
		input.contentPreviewTruncated ?? evidence.textPreviewTruncated,
	usage: input.usage,
});

const abortProviderStream = (
	evidence: ProviderStreamEvidence,
	input: {
		durationMs: number;
		reason: unknown;
	}
): ProviderStreamEvidence => ({
	...evidence,
	endedBy: "abort",
	durationMs: input.durationMs,
	abortReason: normalizeAbortReason(input.reason),
});

const errorProviderStream = (
	evidence: ProviderStreamEvidence,
	input: {
		durationMs: number;
		error: Record<string, unknown>;
	}
): ProviderStreamEvidence => ({
	...evidence,
	endedBy: "error",
	durationMs: input.durationMs,
	error: input.error,
});

const classifyProviderStreamOutcome = (
	evidence: ProviderStreamEvidence
): ProviderStreamOutcome => {
	if (evidence.endedBy === "error") {
		return "error";
	}

	if (evidence.endedBy === "abort") {
		return "aborted";
	}

	if (evidence.textCharCount > 0) {
		return "text";
	}

	if (evidence.toolCallCount > 0) {
		return "tool_only";
	}

	return "empty";
};

const getProviderSpanStatus = (outcome: ProviderStreamOutcome) =>
	outcome === "error" ? "failed" : "completed";

const toProviderStreamOutput = (
	evidence: ProviderStreamEvidence,
	outcome: ProviderStreamOutcome
) => ({
	providerOutcome: outcome,
	contributionKinds: evidence.contributionKinds,
	firstTokenAt: evidence.firstTokenAt,
	finishReason: evidence.finishReason,
	durationMs: evidence.durationMs,
	contentLength: evidence.contentLength,
	textCharCount: evidence.textCharCount,
	textPreview: evidence.textPreview,
	textPreviewTruncated: evidence.textPreviewTruncated,
	toolCallCount: evidence.toolCallCount,
	usage: evidence.usage,
	...(outcome === "aborted"
		? {
				abortReason: evidence.abortReason,
			}
		: {}),
});

const toProviderTurnError = (input: {
	evidence: ProviderStreamEvidence;
	providerKey: string;
	modelKey: string;
	outcome: ProviderStreamOutcome;
}) => ({
	providerOutcome: input.outcome,
	providerKey: input.providerKey,
	modelKey: input.modelKey,
	providerStream: toProviderStreamOutput(input.evidence, input.outcome),
	...(input.outcome === "error" && input.evidence.error
		? {
				providerError: input.evidence.error,
			}
		: {}),
});

const resolveTurnFromProviderOutcome = (input: {
	evidence: ProviderStreamEvidence;
	providerKey: string;
	modelKey: string;
}): ProviderTurnResolution => {
	const providerOutcome = classifyProviderStreamOutcome(input.evidence);
	const error = toProviderTurnError({
		evidence: input.evidence,
		providerKey: input.providerKey,
		modelKey: input.modelKey,
		outcome: providerOutcome,
	});

	switch (providerOutcome) {
		case "text":
		case "tool_only":
			return {
				providerOutcome,
				status: "completed",
			};
		case "aborted":
			return {
				providerOutcome,
				status: "aborted",
				errorCode: "aborted",
				error,
			};
		case "empty":
			return {
				providerOutcome,
				status: "failed",
				errorCode: "empty_provider_response",
				error,
			};
		case "error":
			return {
				providerOutcome,
				status: "failed",
				errorCode: "provider_stream_failed",
				error,
			};
	}
};

export type {
	ProviderContributionKind,
	ProviderStreamEndKind,
	ProviderStreamEvidence,
	ProviderStreamOutcome,
	ProviderTurnResolution,
};
export {
	abortProviderStream,
	classifyProviderStreamOutcome,
	createProviderStreamEvidence,
	errorProviderStream,
	finishProviderStream,
	getProviderSpanStatus,
	recordProviderTextContribution,
	recordProviderToolActivity,
	resolveTurnFromProviderOutcome,
	toProviderStreamOutput,
};
