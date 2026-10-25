import { call } from "@orpc/server";
import { Effect } from "effect";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { captureOrpcError, createTestContext } from "./test-support";

const mocks = vi.hoisted(() => ({
  getDecisionJevProviderConfig: vi.fn(),
  upsertProviderConfig: vi.fn(),
}));

vi.mock("@neobuni/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@neobuni/db")>();
  return {
    ...actual,
    getDecisionJevProviderConfig: mocks.getDecisionJevProviderConfig,
    upsertProviderConfig: mocks.upsertProviderConfig,
  };
});

const { extrasRouter } = await import("../routers/extras");

const existingConfig = {
  id: "jev-1",
  profileId: "profile-1",
  slot: "decision_jev",
  provider: "openrouter",
  protocol: "openai",
  model: "typesafe/jev-1.14",
  apiKey: "sk-or-existing",
  baseUrl: "https://openrouter.ai/api/alpha/decisions",
  enabled: true,
  metadata: {},
  createdAt: "2026-10-22T00:00:00.000Z",
  updatedAt: "2026-10-22T00:00:00.000Z",
};

const update = {
  provider: "openrouter" as const,
  protocol: "openai" as const,
  model: "typesafe/jev-1.14",
  apiKey: "",
  baseUrl: "https://openrouter.ai/api/alpha/decisions",
  enabled: true,
  metadata: {},
};

describe("Jev Settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDecisionJevProviderConfig.mockReturnValue(
      Effect.succeed(existingConfig)
    );
    mocks.upsertProviderConfig.mockImplementation(
      (_profileId: string, _slot: string, input: Record<string, unknown>) =>
        Effect.succeed({
          ...existingConfig,
          ...input,
          apiKey: input.apiKey,
        })
    );
  });

  test("does not return the saved OpenRouter API key", async () => {
    const config = await call(extrasRouter.config.provider.jev.get, undefined, {
      context: createTestContext(),
    });

    expect(config).toMatchObject({ apiKey: "", hasApiKey: true });
  });

  test("rejects a blank key on first configuration", async () => {
    mocks.getDecisionJevProviderConfig.mockReturnValueOnce(
      Effect.succeed(null)
    );

    const error = await captureOrpcError(() =>
      call(extrasRouter.config.provider.jev.update, update, {
        context: createTestContext(),
      })
    );

    expect(error.code).toBe("BAD_REQUEST");
  });

  test("preserves an existing key for a blank-key update", async () => {
    await call(extrasRouter.config.provider.jev.update, update, {
      context: createTestContext(),
    });

    expect(mocks.upsertProviderConfig.mock.calls.at(-1)?.[2]).toMatchObject({
      apiKey: "sk-or-existing",
    });
  });
});
