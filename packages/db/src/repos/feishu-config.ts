import type {
	FeishuConfigInput,
	FeishuReceiveIdType,
} from "@neobuni/contracts";
import { Effect } from "effect";

import {
	getStoredMessagingIntegration,
	getStoredMessagingPlatformConfig,
	listStoredMessagingTargets,
	type StoredMessagingIntegration,
	type StoredMessagingTarget,
	upsertMessagingPlatformConfig,
} from "./messaging-config";

type StoredFeishuTarget = {
	alias: string;
	label: string;
	receiveIdType: FeishuReceiveIdType;
	receiveId: string;
	enabled: boolean;
};

type StoredFeishuIntegration = {
	id: string;
	profileId: string;
	enabled: boolean;
	appId: string;
	appSecret: string;
	baseUrl: string;
	createdAt: string;
	updatedAt: string;
};

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");

const toStoredFeishuTarget = (
	target: StoredMessagingTarget
): StoredFeishuTarget => ({
	alias: target.alias,
	label: target.label,
	receiveIdType: target.targetType as FeishuReceiveIdType,
	receiveId: target.targetId,
	enabled: target.enabled,
});

const toStoredFeishuIntegration = (
	integration: StoredMessagingIntegration | null
): StoredFeishuIntegration | null =>
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

export const getStoredFeishuIntegration = Effect.fnUntraced(function* (
	profileId: string
) {
	return toStoredFeishuIntegration(
		yield* getStoredMessagingIntegration(profileId, "feishu")
	);
});

export const listStoredFeishuTargets = Effect.fnUntraced(function* (
	profileId: string
) {
	const targets = yield* listStoredMessagingTargets(profileId, "feishu");
	return targets.map(toStoredFeishuTarget);
});

export const getStoredFeishuConfig = Effect.fnUntraced(function* (
	profileId: string
) {
	const stored = yield* getStoredMessagingPlatformConfig(profileId, "feishu");

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
		targets: stored.targets.map(toStoredFeishuTarget),
		createdAt: stored.createdAt,
		updatedAt: stored.updatedAt,
	};
});

export const upsertFeishuConfig = Effect.fnUntraced(function* (
	profileId: string,
	input: FeishuConfigInput
) {
	const normalizedBaseUrl = normalizeBaseUrl(input.baseUrl);

	yield* upsertMessagingPlatformConfig(profileId, "feishu", {
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
			targetType: target.receiveIdType,
			targetId: target.receiveId,
			enabled: target.enabled,
			metadata: {},
		})),
	});

	return yield* getStoredFeishuConfig(profileId);
});
