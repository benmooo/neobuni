import { chatForwardedPropsSchema } from "@neobuni/contracts";
import { getLatestUserText } from "@neobuni/core";
import { getConversation as getConversationFx, runRepo } from "@neobuni/db";

const getConversation = (...args: Parameters<typeof getConversationFx>) =>
	runRepo(getConversationFx(...args));

import {
	chatParamsFromRequest,
	toServerSentEventsResponse,
} from "@tanstack/ai";
import { Effect } from "effect";
import { Hono } from "hono";
import { requireActiveProfile } from "../auth/context";
import { createChatTurnStream } from "../runtime/create-chat-turn-stream";
import { auth } from "../services";

const readConversationId = (
	threadId: string,
	forwardedProps: Record<string, unknown>
) => {
	const parsedForwardedProps =
		chatForwardedPropsSchema.safeParse(forwardedProps);

	if (!parsedForwardedProps.success) {
		return {
			ok: false as const,
			error: "Invalid chat forwardedProps",
		};
	}

	return {
		ok: true as const,
		conversationId:
			parsedForwardedProps.data.conversationId?.trim() ?? threadId.trim(),
		clientTimezone: parsedForwardedProps.data.timezone?.trim() ?? null,
	};
};

const chatRoutes = new Hono().post("/stream", async (c) => {
	// Canonical server turn runtime entrypoint for chat streaming.
	let params: Awaited<ReturnType<typeof chatParamsFromRequest>>;

	try {
		params = await chatParamsFromRequest(c.req.raw);
	} catch (error) {
		if (error instanceof Response) {
			return error;
		}

		throw error;
	}

	const { profileId } = await Effect.runPromise(
		requireActiveProfile(auth, c.req.raw)
	);
	const abortController = new AbortController();
	const conversationContext = readConversationId(
		params.threadId,
		params.forwardedProps
	);

	if (!conversationContext.ok) {
		return c.json({ error: conversationContext.error }, 400);
	}

	const { conversationId, clientTimezone } = conversationContext;
	const latestUserText = getLatestUserText(
		params.messages as Array<{
			role: string;
			content?: string | null;
		}>
	);

	if (!conversationId) {
		return c.json({ error: "conversationId is required" }, 400);
	}

	if (!latestUserText) {
		return c.json({ error: "No user input provided" }, 400);
	}

	const conversation = await getConversation(conversationId);
	if (!conversation || conversation.profileId !== profileId) {
		return c.json({ error: "Conversation not found" }, 404);
	}

	c.req.raw.signal.addEventListener(
		"abort",
		() => {
			const error = new Error("client_request_aborted");
			error.name = "ClientRequestAbort";
			abortController.abort(c.req.raw.signal.reason ?? error);
		},
		{
			once: true,
		}
	);

	const stream = await createChatTurnStream({
		profileId,
		abortController,
		conversationId,
		threadId: params.threadId,
		clientTimezone,
		latestUserText,
		clientTools: params.tools,
	});

	return toServerSentEventsResponse(stream, {
		status: 200,
		abortController,
		headers: {
			"Cache-Control": "no-cache, no-transform",
		},
	});
});

export { chatRoutes };
