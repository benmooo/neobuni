import type { ModelMessage } from "@tanstack/ai";
import { describe, expect, test } from "vitest";

import {
	expandPersistedMessagesToHydratedUiMessages,
	normalizePersistedMessages,
	serializeTranscriptEnvelope,
} from "./transcript";

describe("runtime transcript", () => {
	test("normalizes persisted messages without provider replay", () => {
		const messages = normalizePersistedMessages([
			{
				id: "system-1",
				role: "system",
				content: "You are Buni.",
			},
			{
				id: "user-1",
				role: "user",
				content: "杭州天气",
			},
			{
				id: "assistant-1",
				role: "assistant",
				content: "杭州现在 26 度。",
			},
			{
				id: "tool-1",
				role: "tool",
				content: '{"temperature":26}',
			},
		]);

		expect(messages).toEqual([
			{
				role: "user",
				content: "杭州天气",
			},
			{
				role: "assistant",
				content: "杭州现在 26 度。",
			},
			{
				role: "tool",
				content: '{"temperature":26}',
			},
		]);
	});

	test("hydrates ui transcript from nested transcript metadata", () => {
		const transcriptMessages: ModelMessage[] = [
			{
				role: "assistant",
				content: null,
				toolCalls: [
					{
						id: "tool-1",
						type: "function",
						function: {
							name: "get_weather",
							arguments: '{"city":"Hangzhou"}',
						},
					},
				],
			},
			{
				role: "tool",
				toolCallId: "tool-1",
				content: '{"temperature":26}',
			},
			{
				role: "assistant",
				content: "杭州现在 26 度。",
			},
		];

		const hydratedMessages = expandPersistedMessagesToHydratedUiMessages([
			{
				id: "assistant-1",
				role: "assistant",
				content: "杭州现在 26 度。",
				createdAt: "2026-05-25T10:00:00.000Z",
				metadata: {
					render: {
						voice: {
							style: "gentle",
						},
						ui: {
							bubbleVariant: "support",
						},
					},
					transcript: serializeTranscriptEnvelope(transcriptMessages),
				},
			},
		]);

		expect(hydratedMessages).toHaveLength(2);
		expect(hydratedMessages[0]).toMatchObject({
			id: "assistant-1:transcript:0",
			role: "assistant",
		});
		expect(hydratedMessages[0]?.metadata).not.toHaveProperty("render");
		expect(hydratedMessages[1]).toMatchObject({
			id: "assistant-1",
			role: "assistant",
			metadata: {
				render: {
					ui: {
						bubbleVariant: "support",
					},
				},
			},
		});
		expect(
			hydratedMessages[0]?.parts.some((part) => part.type === "tool-call")
		).toBe(true);
		expect(
			hydratedMessages[0]?.parts.some((part) => part.type === "tool-result")
		).toBe(true);
		expect(hydratedMessages[1]?.parts).toEqual([
			{
				type: "text",
				content: "杭州现在 26 度。",
			},
		]);
	});

	test("falls back to persisted text when no transcript metadata exists", () => {
		const hydratedMessages = expandPersistedMessagesToHydratedUiMessages([
			{
				id: "assistant-1",
				role: "assistant",
				content: "杭州现在 26 度。",
			},
		]);

		expect(hydratedMessages).toEqual([
			{
				id: "assistant-1",
				role: "assistant",
				parts: [
					{
						type: "text",
						content: "杭州现在 26 度。",
					},
				],
			},
		]);
	});
});
