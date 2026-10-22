import { describe, expect, test } from "vitest";

import {
  abortProviderStream,
  createProviderStreamEvidence,
  errorProviderStream,
  finishProviderStream,
  recordProviderTextContribution,
  recordProviderToolActivity,
  resolveTurnFromProviderOutcome,
} from "./provider-stream-outcome";

const providerKey = "openai";
const modelKey = "gpt-4.1";

describe("resolveTurnFromProviderOutcome", () => {
  test("maps text evidence to completed", () => {
    const evidence = finishProviderStream(
      recordProviderTextContribution(createProviderStreamEvidence(), {
        delta: "hello",
        timestampIso: "2026-04-30T00:00:00.000Z",
      }),
      {
        finishReason: "stop",
        durationMs: 120,
        contentLength: 5,
        usage: null,
      },
    );

    expect(resolveTurnFromProviderOutcome({
      evidence,
      providerKey,
      modelKey,
    })).toEqual({
      providerOutcome: "text",
      status: "completed",
    });
  });

  test("maps tool-only evidence to completed", () => {
    const evidence = finishProviderStream(
      recordProviderToolActivity(createProviderStreamEvidence()),
      {
        finishReason: "tool_calls",
        durationMs: 120,
        contentLength: 0,
        usage: null,
      },
    );

    expect(resolveTurnFromProviderOutcome({
      evidence,
      providerKey,
      modelKey,
    })).toEqual({
      providerOutcome: "tool_only",
      status: "completed",
    });
  });

  test("maps empty evidence to empty_provider_response", () => {
    const evidence = finishProviderStream(createProviderStreamEvidence(), {
      finishReason: null,
      durationMs: 120,
      contentLength: 0,
      usage: null,
    });

    expect(resolveTurnFromProviderOutcome({
      evidence,
      providerKey,
      modelKey,
    })).toEqual({
      providerOutcome: "empty",
      status: "failed",
      errorCode: "empty_provider_response",
      error: {
        providerOutcome: "empty",
        providerKey,
        modelKey,
        providerStream: {
          providerOutcome: "empty",
          contributionKinds: [],
          firstTokenAt: null,
          finishReason: null,
          durationMs: 120,
          contentLength: 0,
          textCharCount: 0,
          textPreview: null,
          textPreviewTruncated: false,
          toolCallCount: 0,
          usage: null,
        },
      },
    });
  });

  test("maps aborted evidence to aborted", () => {
    const evidence = abortProviderStream(createProviderStreamEvidence(), {
      durationMs: 120,
      reason: "aborted",
    });

    expect(resolveTurnFromProviderOutcome({
      evidence,
      providerKey,
      modelKey,
    })).toEqual({
      providerOutcome: "aborted",
      status: "aborted",
      errorCode: "aborted",
      error: {
        providerOutcome: "aborted",
        providerKey,
        modelKey,
        providerStream: {
          providerOutcome: "aborted",
          contributionKinds: [],
          firstTokenAt: null,
          finishReason: null,
          durationMs: 120,
          contentLength: 0,
          textCharCount: 0,
          textPreview: null,
          textPreviewTruncated: false,
          toolCallCount: 0,
          usage: null,
          abortReason: "aborted",
        },
      },
    });
  });

  test("maps provider errors to provider_stream_failed", () => {
    const evidence = errorProviderStream(createProviderStreamEvidence(), {
      durationMs: 120,
      error: {
        name: "ProviderError",
        message: "boom",
      },
    });

    expect(resolveTurnFromProviderOutcome({
      evidence,
      providerKey,
      modelKey,
    })).toEqual({
      providerOutcome: "error",
      status: "failed",
      errorCode: "provider_stream_failed",
      error: {
        providerOutcome: "error",
        providerKey,
        modelKey,
        providerStream: {
          providerOutcome: "error",
          contributionKinds: [],
          firstTokenAt: null,
          finishReason: null,
          durationMs: 120,
          contentLength: 0,
          textCharCount: 0,
          textPreview: null,
          textPreviewTruncated: false,
          toolCallCount: 0,
          usage: null,
        },
        providerError: {
          name: "ProviderError",
          message: "boom",
        },
      },
    });
  });
});
