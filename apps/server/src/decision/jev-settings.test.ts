import { describe, expect, test } from "vitest";

import {
  resolveJevProviderConfigInput,
  toPublicJevProviderConfig,
} from "./jev-settings";

const existing = {
  id: "provider-1",
  profileId: "profile-1",
  slot: "decision_jev",
  provider: "openrouter" as const,
  protocol: "openai" as const,
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
  metadata: {
    timeoutMs: 3000,
    maxRetries: 1,
    retrievalShadowEnabled: false,
    graphV2ShadowEnabled: false,
    evidenceRelevanceShadowEnabled: false,
    retrievalRoutingEnabled: false,
    retrievalConfidenceThreshold: 0.85,
    retrievalMinComparedPairs: 20,
    retrievalMinAgreementRate: 0.85,
    retrievalMaxAverageLatencyMs: 3000,
    retrievalMaxProviderErrorRate: 0.05,
    nextActionShadowEnabled: false,
  },
};

describe("Jev Settings secret boundary", () => {
  test("does not serialize an API key back to the Settings client", () => {
    expect(toPublicJevProviderConfig(existing)).toMatchObject({
      apiKey: "",
      hasApiKey: true,
    });
  });

  test("preserves an existing key when a Settings update leaves it blank", () => {
    expect(resolveJevProviderConfigInput({ existing, update }).apiKey).toBe(
      "sk-or-existing"
    );
  });

  test("refuses a blank key on first configuration", () => {
    expect(() =>
      resolveJevProviderConfigInput({ existing: null, update })
    ).toThrow();
  });
});
