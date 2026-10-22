import {
  getStoredQqConfig as getStoredQqConfigFx,
  runRepo,
  upsertQqConfig as upsertStoredQqConfigFx,
} from "@neobuni/db";

const getStoredQqConfig = (...args: Parameters<typeof getStoredQqConfigFx>) =>
  runRepo(getStoredQqConfigFx(...args));
const upsertStoredQqConfig = (
  ...args: Parameters<typeof upsertStoredQqConfigFx>
) => runRepo(upsertStoredQqConfigFx(...args));

import type {
  QqConfig,
  QqConfigInput,
  QqMessagePayload,
  QqTargetConfigInput,
  QqTargetType,
} from "@neobuni/contracts";

interface SendQqMessageInput {
  eventId?: string;
  message: QqMessagePayload;
  msgId?: string;
  msgSeq?: number;
  targetAlias?: string;
  targetId?: string;
  targetType?: QqTargetType;
}

interface SendQqMessageResult {
  delivered: boolean;
  deliveryMode: "active" | "passive";
  messageId: string | null;
  messageType: "text";
  preview: string;
  target: {
    alias: string | null;
    targetType: QqTargetType;
    targetId: string;
  };
}

interface QqTargetSummary {
  alias: string;
  label: string | null;
  targetIdPreview: string;
  targetType: QqTargetType;
}

interface QqAccessTokenCacheEntry {
  expiresAtMs: number;
  token: string;
}

interface ResolvedQqTarget {
  alias: string;
  enabled: boolean;
  label: string;
  targetId: string;
  targetType: QqTargetType;
}

interface QqTransportConfig {
  appId: string;
  appSecret: string;
  baseUrl: string;
  enabled: boolean;
}

const QQ_ACCESS_TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";
const DEFAULT_QQ_BASE_URL = "https://api.sgroup.qq.com";
const cachedAccessTokenByKey = new Map<string, QqAccessTokenCacheEntry>();

const resetQqAccessTokenCacheForTest = () => {
  cachedAccessTokenByKey.clear();
};

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");

const parseTargetsJson = (value: string | undefined): QqTargetConfigInput[] => {
  if (!value || value.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as Record<
      string,
      {
        label?: string;
        targetType?: string;
        targetId?: string;
        enabled?: boolean;
      }
    >;

    return Object.entries(parsed)
      .flatMap(([alias, target]) => {
        if (
          typeof target?.targetType !== "string" ||
          typeof target?.targetId !== "string" ||
          target.targetId.trim().length === 0
        ) {
          return [];
        }

        return [
          {
            alias,
            label: typeof target.label === "string" ? target.label.trim() : "",
            targetType: target.targetType as QqTargetType,
            targetId: target.targetId.trim(),
            enabled: target.enabled ?? true,
          },
        ];
      })
      .sort((left, right) => left.alias.localeCompare(right.alias));
  } catch {
    return [];
  }
};

const previewTargetId = (value: string) =>
  value.length <= 10 ? value : `${value.slice(0, 4)}...${value.slice(-4)}`;

const createQqConfig = (
  profileId: string,
  input?: Partial<QqConfig>
): QqConfig => {
  const now = new Date().toISOString();

  return {
    id: input?.id ?? "qq-config-default",
    profileId,
    source: input?.source ?? "default",
    enabled: input?.enabled ?? false,
    appId: input?.appId ?? "",
    appSecret: input?.appSecret ?? "",
    baseUrl: input?.baseUrl ?? "",
    targets: input?.targets ?? [],
    createdAt: input?.createdAt ?? now,
    updatedAt: input?.updatedAt ?? now,
  };
};

const readEnvQqConfig = (profileId: string): QqConfig | null => {
  const appId = process.env.NEOBUNI_QQ_APP_ID?.trim() ?? "";
  const appSecret = process.env.NEOBUNI_QQ_APP_SECRET?.trim() ?? "";
  const baseUrl = normalizeBaseUrl(
    process.env.NEOBUNI_QQ_BASE_URL?.trim() ?? ""
  );
  const targets = parseTargetsJson(process.env.NEOBUNI_QQ_TARGETS_JSON);

  if (!(appId || appSecret || baseUrl) && targets.length === 0) {
    return null;
  }

  return createQqConfig(profileId, {
    source: "env",
    enabled: appId.length > 0 && appSecret.length > 0,
    appId,
    appSecret,
    baseUrl,
    targets,
  });
};

const getEffectiveQqConfig = async (profileId: string): Promise<QqConfig> => {
  const storedConfig = await getStoredQqConfig(profileId);

  if (storedConfig) {
    return storedConfig;
  }

  return readEnvQqConfig(profileId) ?? createQqConfig(profileId);
};

const saveQqConfig = async (
  profileId: string,
  input: QqConfigInput
): Promise<QqConfig> => {
  // AGGRESSIVE REFACTOR: keep QQ bot transport config profile-scoped like Feishu.
  const storedConfig = await upsertStoredQqConfig(profileId, input);

  if (!storedConfig) {
    throw new Error("Failed to save QQ config.");
  }

  return storedConfig;
};

const toTransportConfig = (config: QqConfig): QqTransportConfig => ({
  enabled: config.enabled,
  appId: config.appId.trim(),
  appSecret: config.appSecret.trim(),
  baseUrl:
    config.baseUrl.trim().length > 0
      ? normalizeBaseUrl(config.baseUrl)
      : DEFAULT_QQ_BASE_URL,
});

const assertTransportConfigured = (transport: QqTransportConfig) => {
  if (!(transport.enabled && transport.appId && transport.appSecret)) {
    throw new Error(
      "QQ integration is not configured. Save app credentials in Settings > QQ or set NEOBUNI_QQ_APP_ID and NEOBUNI_QQ_APP_SECRET."
    );
  }
};

const buildAccessTokenCacheKey = (input: {
  profileId: string;
  transport: QqTransportConfig;
}) =>
  [input.profileId, input.transport.appId, input.transport.baseUrl].join("::");

const getCachedAppAccessToken = async (input: {
  profileId: string;
  transport: QqTransportConfig;
}) => {
  const now = Date.now();
  const cacheKey = buildAccessTokenCacheKey(input);
  const cachedAccessToken = cachedAccessTokenByKey.get(cacheKey);

  if (cachedAccessToken && cachedAccessToken.expiresAtMs > now + 60_000) {
    return cachedAccessToken.token;
  }

  const response = await fetch(QQ_ACCESS_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      appId: input.transport.appId,
      clientSecret: input.transport.appSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch QQ access token (${response.status}): ${errorText}`
    );
  }

  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number | string;
  };

  if (!json.access_token) {
    throw new Error("QQ access token response was missing access_token.");
  }

  const expiresIn =
    typeof json.expires_in === "string"
      ? Number.parseInt(json.expires_in, 10)
      : json.expires_in;

  cachedAccessTokenByKey.set(cacheKey, {
    token: json.access_token,
    expiresAtMs: now + Math.max(60, expiresIn ?? 7200) * 1000,
  });

  return json.access_token;
};

const getEnabledTargets = (config: QqConfig): ResolvedQqTarget[] =>
  config.targets
    .filter((target) => target.enabled)
    .map((target) => ({
      alias: target.alias,
      label: target.label,
      targetType: target.targetType,
      targetId: target.targetId,
      enabled: target.enabled,
    }));

const resolveTarget = (
  config: QqConfig,
  input: Pick<SendQqMessageInput, "targetAlias" | "targetType" | "targetId">
) => {
  const enabledTargets = getEnabledTargets(config);

  if (input.targetAlias) {
    const target = enabledTargets.find(
      (item) => item.alias === input.targetAlias
    );

    if (!target) {
      throw new Error(
        `Unknown QQ target alias: ${input.targetAlias}. Configure a target alias in Settings > QQ or pass an explicit targetType plus targetId.`
      );
    }

    return {
      alias: input.targetAlias,
      targetType: target.targetType,
      targetId: target.targetId,
    };
  }

  if (!(input.targetType || input.targetId) && enabledTargets.length === 1) {
    const target = enabledTargets[0]!;

    return {
      alias: target.alias,
      targetType: target.targetType,
      targetId: target.targetId,
    };
  }

  if (!(input.targetType && input.targetId)) {
    throw new Error(
      "send_qq_message requires targetAlias or explicit targetType plus targetId. If exactly one QQ target is enabled, omitting all target fields will use it automatically."
    );
  }

  return {
    alias: null,
    targetType: input.targetType,
    targetId: input.targetId,
  };
};

const buildMessagePayload = (input: SendQqMessageInput) => {
  const deliveryMode =
    input.eventId || input.msgId ? ("passive" as const) : ("active" as const);
  const preview =
    input.message.text.length > 240
      ? `${input.message.text.slice(0, 240)}...`
      : input.message.text;

  return {
    body: {
      content: input.message.text,
      msg_type: 0,
      ...(input.eventId ? { event_id: input.eventId } : {}),
      ...(input.msgId ? { msg_id: input.msgId } : {}),
      ...(input.msgSeq ? { msg_seq: input.msgSeq } : {}),
    },
    deliveryMode,
    messageType: "text" as const,
    preview,
  };
};

const buildMessageUrl = (
  transport: QqTransportConfig,
  target: {
    targetType: QqTargetType;
    targetId: string;
  }
) =>
  target.targetType === "group_openid"
    ? `${transport.baseUrl}/v2/groups/${encodeURIComponent(target.targetId)}/messages`
    : `${transport.baseUrl}/v2/users/${encodeURIComponent(target.targetId)}/messages`;

const sendQqMessage = async (
  profileId: string,
  input: SendQqMessageInput
): Promise<SendQqMessageResult> => {
  const config = await getEffectiveQqConfig(profileId);
  const transport = toTransportConfig(config);
  assertTransportConfigured(transport);
  const target = resolveTarget(config, input);
  const messagePayload = buildMessagePayload(input);
  const token = await getCachedAppAccessToken({
    profileId,
    transport,
  });
  const response = await fetch(buildMessageUrl(transport, target), {
    method: "POST",
    headers: {
      Authorization: `QQBot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messagePayload.body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to send QQ message (${response.status}): ${errorText}`
    );
  }

  const json = (await response.json()) as {
    id?: string;
  };

  return {
    delivered: true,
    messageId: json.id ?? null,
    target,
    deliveryMode: messagePayload.deliveryMode,
    messageType: messagePayload.messageType,
    preview: messagePayload.preview,
  };
};

const listQqTargets = async (profileId: string): Promise<QqTargetSummary[]> => {
  const config = await getEffectiveQqConfig(profileId);

  return getEnabledTargets(config).map((target) => ({
    alias: target.alias,
    label: target.label.trim().length > 0 ? target.label : null,
    targetType: target.targetType,
    targetIdPreview: previewTargetId(target.targetId),
  }));
};

export type { QqTargetSummary, SendQqMessageInput, SendQqMessageResult };
export {
  getEffectiveQqConfig,
  listQqTargets,
  previewTargetId,
  resetQqAccessTokenCacheForTest,
  saveQqConfig,
  sendQqMessage,
};
