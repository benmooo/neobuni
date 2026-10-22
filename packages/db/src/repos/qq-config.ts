import type { QqConfigInput, QqTargetType } from "@neobuni/contracts";
import { Effect } from "effect";

import {
  getStoredMessagingIntegration,
  getStoredMessagingPlatformConfig,
  listStoredMessagingTargets,
  type StoredMessagingIntegration,
  type StoredMessagingTarget,
  upsertMessagingPlatformConfig,
} from "./messaging-config";

interface StoredQqTarget {
  alias: string;
  enabled: boolean;
  label: string;
  targetId: string;
  targetType: QqTargetType;
}

interface StoredQqIntegration {
  appId: string;
  appSecret: string;
  baseUrl: string;
  createdAt: string;
  enabled: boolean;
  id: string;
  profileId: string;
  updatedAt: string;
}

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");

const toStoredQqTarget = (target: StoredMessagingTarget): StoredQqTarget => ({
  alias: target.alias,
  label: target.label,
  targetType: target.targetType as QqTargetType,
  targetId: target.targetId,
  enabled: target.enabled,
});

const toStoredQqIntegration = (
  integration: StoredMessagingIntegration | null
): StoredQqIntegration | null =>
  integration
    ? {
        id: integration.id,
        profileId: integration.profileId,
        enabled: integration.enabled,
        appId: integration.appId,
        appSecret: integration.appSecret,
        baseUrl: integration.baseUrl,
        createdAt: integration.createdAt,
        updatedAt: integration.updatedAt,
      }
    : null;

export const getStoredQqIntegration = Effect.fnUntraced(function* (
  profileId: string
) {
  return toStoredQqIntegration(
    yield* getStoredMessagingIntegration(profileId, "qq")
  );
});

export const listStoredQqTargets = Effect.fnUntraced(function* (
  profileId: string
) {
  const targets = yield* listStoredMessagingTargets(profileId, "qq");
  return targets.map(toStoredQqTarget);
});

export const getStoredQqConfig = Effect.fnUntraced(function* (
  profileId: string
) {
  const stored = yield* getStoredMessagingPlatformConfig(profileId, "qq");

  if (!stored) {
    return null;
  }

  return {
    id: stored.id,
    profileId: stored.profileId,
    source: stored.source,
    enabled: stored.enabled,
    appId: stored.appId,
    appSecret: stored.appSecret,
    baseUrl: stored.baseUrl,
    targets: stored.targets.map(toStoredQqTarget),
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  };
});

export const upsertQqConfig = Effect.fnUntraced(function* (
  profileId: string,
  input: QqConfigInput
) {
  const normalizedBaseUrl = normalizeBaseUrl(input.baseUrl);

  yield* upsertMessagingPlatformConfig(profileId, "qq", {
    enabled: input.enabled,
    botToken: "",
    appId: input.appId,
    appSecret: input.appSecret,
    publicKey: "",
    webhookSecret: "",
    baseUrl: normalizedBaseUrl,
    metadata: {},
    targets: input.targets.map((target) => ({
      alias: target.alias,
      label: target.label,
      targetType: target.targetType,
      targetId: target.targetId,
      enabled: target.enabled,
      metadata: {},
    })),
  });

  return yield* getStoredQqConfig(profileId);
});
