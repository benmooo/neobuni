import type {
	DecisionProviderResult,
	DecisionRequest,
} from "@neobuni/contracts";
import { Effect, tryPromise } from "../../effect";

const OPENROUTER_DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";

type OpenRouterJevConfig = {
	apiKey: string;
	model: string;
	baseUrl?: string;
	fetchImpl?: (
		input: string | URL | Request,
		init?: RequestInit
	) => Promise<Response>;
	timeoutMs?: number;
	maxRetries?: number;
};

type JevAnswer = {
	choice?: string;
	score?: number;
	noul?: number;
	probabilities?: Record<string, number>;
	confidence?: number;
};

type JevAttempt =
	| { readonly ok: true; readonly response: Response }
	| { readonly ok: false; readonly error: Error; readonly retryable: boolean };

const clampScore = (value: number | undefined) =>
	Math.min(1, Math.max(0, Number.isFinite(value) ? (value ?? 0) : 0));

const toQuestionPayload = (question: DecisionRequest["questions"][number]) => ({
	type: question.kind,
	instructions: question.instructions,
	...(question.criteria
		? {
				criteria:
					question.kind === "score"
						? Object.values(question.criteria)
						: question.criteria,
			}
		: {}),
});

const toSelectedValue = (
	kind: "choice" | "score" | "noul",
	answer: JevAnswer
) =>
	kind === "choice"
		? (answer.choice ?? "unknown")
		: kind === "score"
			? clampScore(answer.score)
			: (answer.noul ?? 0) >= 0.5;

const isRetryableStatus = (status: number) => status === 429 || status >= 500;

const toError = (cause: unknown): Error =>
	cause instanceof Error ? cause : new Error(String(cause));

const readProviderError = Effect.fnUntraced(function* (response: Response) {
	const body = yield* tryPromise("openrouter.jev.read-error-body", () =>
		response.text()
	).pipe(Effect.orElseSucceed(() => ""));
	if (body.length === 0) {
		return `OpenRouter Jev request failed: ${response.status}`;
	}
	try {
		const parsed = JSON.parse(body) as {
			error?: { message?: unknown };
			message?: unknown;
		};
		const message = parsed.error?.message ?? parsed.message;
		return typeof message === "string"
			? `OpenRouter Jev request failed: ${response.status} ${message}`
			: `OpenRouter Jev request failed: ${response.status}`;
	} catch {
		return `OpenRouter Jev request failed: ${response.status}`;
	}
});

const sendJevRequest = Effect.fnUntraced(function* (input: {
	config: OpenRouterJevConfig;
	request: DecisionRequest;
}): Effect.fn.Return<JevAttempt> {
	const outcome = yield* tryPromise("openrouter.jev.request", () =>
		(input.config.fetchImpl ?? fetch)(
			input.config.baseUrl ?? OPENROUTER_DECISIONS_URL,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${input.config.apiKey}`,
					"Content-Type": "application/json",
				},
				signal: AbortSignal.timeout(input.config.timeoutMs ?? 3000),
				body: JSON.stringify({
					model: input.config.model,
					state: input.request.state,
					questions: Object.fromEntries(
						input.request.questions.map((question) => [
							question.id,
							toQuestionPayload(question),
						])
					),
				}),
			}
		)
	).pipe(
		Effect.match({
			onFailure: (error) => ({
				_tag: "error" as const,
				error: toError(error.cause),
			}),
			onSuccess: (response) => ({ _tag: "response" as const, response }),
		})
	);
	if (outcome._tag === "error") {
		return { ok: false, error: outcome.error, retryable: true };
	}
	if (outcome.response.ok) {
		return { ok: true, response: outcome.response };
	}
	const message = yield* readProviderError(outcome.response);
	return {
		ok: false,
		error: new Error(message),
		retryable: isRetryableStatus(outcome.response.status),
	};
});

const requestOpenRouterJev = Effect.fnUntraced(function* (input: {
	config: OpenRouterJevConfig;
	request: DecisionRequest;
}): Effect.fn.Return<Response, Error> {
	const maxRetries = input.config.maxRetries ?? 1;
	let lastError = new Error("OpenRouter Jev request failed");
	for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
		const outcome = yield* sendJevRequest(input);
		if (outcome.ok) {
			return outcome.response;
		}
		lastError = outcome.error;
		if (!outcome.retryable) {
			return yield* Effect.fail(outcome.error);
		}
	}
	return yield* Effect.fail(lastError);
});

const decideOpenRouterJev = Effect.fnUntraced(function* (
	config: OpenRouterJevConfig,
	request: DecisionRequest
): Effect.fn.Return<DecisionProviderResult, Error> {
	const startedAt = performance.now();
	const response = yield* requestOpenRouterJev({ config, request });
	const payload = yield* tryPromise(
		"openrouter.jev.decode-response",
		() =>
			response.json() as Promise<{
				model?: string;
				answers?: Record<string, JevAnswer>;
			}>
	).pipe(Effect.mapError((error) => toError(error.cause)));
	return {
		providerId: "jev",
		providerVersion: payload.model ?? config.model,
		answers: request.questions.map((question) => {
			const answer = payload.answers?.[question.id] ?? {};
			return {
				questionId: question.id,
				kind: question.kind,
				selectedValue: toSelectedValue(question.kind, answer),
				probabilities: answer.probabilities ?? {},
				confidence: answer.confidence ?? null,
			};
		}),
		latencyMs: Math.round(performance.now() - startedAt),
	};
});

const createOpenRouterJevProvider = (config: OpenRouterJevConfig) => ({
	id: "jev" as const,
	decide: (request: DecisionRequest): Promise<DecisionProviderResult> =>
		Effect.runPromise(decideOpenRouterJev(config, request)),
});

export type { OpenRouterJevConfig };
export {
	createOpenRouterJevProvider,
	OPENROUTER_DECISIONS_URL,
	readProviderError,
	requestOpenRouterJev,
};
