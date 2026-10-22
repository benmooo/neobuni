import {
  getStoredFeishuConfig as getStoredFeishuConfigFx,
  runRepo,
  upsertFeishuConfig as upsertStoredFeishuConfigFx,
} from "@neobuni/db";

const getStoredFeishuConfig = (
  ...args: Parameters<typeof getStoredFeishuConfigFx>
) => runRepo(getStoredFeishuConfigFx(...args));
const upsertStoredFeishuConfig = (
  ...args: Parameters<typeof upsertStoredFeishuConfigFx>
) => runRepo(upsertStoredFeishuConfigFx(...args));

import type {
  FeishuConfig,
  FeishuConfigInput,
  FeishuMessagePayload,
  FeishuReceiveIdType,
  FeishuTargetConfigInput,
} from "@neobuni/contracts";

interface SendFeishuMessageInput {
  message: FeishuMessagePayload;
  receiveId?: string;
  receiveIdType?: FeishuReceiveIdType;
  targetAlias?: string;
}

interface SendFeishuMessageResult {
  delivered: boolean;
  messageId: string | null;
  messageType: "text" | "card";
  preview: string;
  target: {
    alias: string | null;
    receiveIdType: FeishuReceiveIdType;
    receiveId: string;
  };
}

interface FeishuTargetSummary {
  alias: string;
  label: string | null;
  receiveIdPreview: string;
  receiveIdType: FeishuReceiveIdType;
}

interface FeishuAccessTokenCacheEntry {
  expiresAtMs: number;
  token: string;
}

interface ResolvedFeishuTarget {
  alias: string;
  enabled: boolean;
  label: string;
  receiveId: string;
  receiveIdType: FeishuReceiveIdType;
}

interface FeishuTransportConfig {
  appId: string;
  appSecret: string;
  baseUrl: string;
  enabled: boolean;
}

const DEFAULT_FEISHU_BASE_URL = "https://open.feishu.cn/open-apis";
const cachedAccessTokenByKey = new Map<string, FeishuAccessTokenCacheEntry>();

const resetFeishuAccessTokenCacheForTest = () => {
  cachedAccessTokenByKey.clear();
};

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");

const parseTargetsJson = (
  value: string | undefined
): FeishuTargetConfigInput[] => {
  if (!value || value.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as Record<
      string,
      {
        label?: string;
        receiveIdType?: string;
        receiveId?: string;
        enabled?: boolean;
      }
    >;

    return Object.entries(parsed)
      .flatMap(([alias, target]) => {
        if (
          typeof target?.receiveIdType !== "string" ||
          typeof target?.receiveId !== "string" ||
          target.receiveId.trim().length === 0
        ) {
          return [];
        }

        return [
          {
            alias,
            label: typeof target.label === "string" ? target.label.trim() : "",
            receiveIdType: target.receiveIdType as FeishuReceiveIdType,
            receiveId: target.receiveId.trim(),
            enabled: target.enabled ?? true,
          },
        ];
      })
      .sort((left, right) => left.alias.localeCompare(right.alias));
  } catch {
    return [];
  }
};

const previewReceiveId = (value: string) =>
  value.length <= 10 ? value : `${value.slice(0, 4)}...${value.slice(-4)}`;

const createFeishuConfig = (
  profileId: string,
  input?: Partial<FeishuConfig>
): FeishuConfig => {
  const now = new Date().toISOString();

  return {
    id: input?.id ?? "feishu-config-default",
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

const readEnvFeishuConfig = (profileId: string): FeishuConfig | null => {
  const appId = process.env.NEOBUNI_FEISHU_APP_ID?.trim() ?? "";
  const appSecret = process.env.NEOBUNI_FEISHU_APP_SECRET?.trim() ?? "";
  const baseUrl = normalizeBaseUrl(
    process.env.NEOBUNI_FEISHU_BASE_URL?.trim() ?? ""
  );
  const targets = parseTargetsJson(process.env.NEOBUNI_FEISHU_TARGETS_JSON);

  if (!(appId || appSecret || baseUrl) && targets.length === 0) {
    return null;
  }

  return createFeishuConfig(profileId, {
    source: "env",
    enabled: appId.length > 0 && appSecret.length > 0,
    appId,
    appSecret,
    baseUrl,
    targets,
  });
};

const getEffectiveFeishuConfig = async (
  profileId: string
): Promise<FeishuConfig> => {
  const storedConfig = await getStoredFeishuConfig(profileId);

  if (storedConfig) {
    return storedConfig;
  }

  return readEnvFeishuConfig(profileId) ?? createFeishuConfig(profileId);
};

const saveFeishuConfig = async (
  profileId: string,
  input: FeishuConfigInput
): Promise<FeishuConfig> => {
  // AGGRESSIVE REFACTOR: move Feishu transport and targets into profile-scoped DB config.
  const storedConfig = await upsertStoredFeishuConfig(profileId, input);

  if (!storedConfig) {
    throw new Error("Failed to save Feishu config.");
  }

  return storedConfig;
};

const toTransportConfig = (config: FeishuConfig): FeishuTransportConfig => ({
  enabled: config.enabled,
  appId: config.appId.trim(),
  appSecret: config.appSecret.trim(),
  baseUrl:
    config.baseUrl.trim().length > 0
      ? normalizeBaseUrl(config.baseUrl)
      : DEFAULT_FEISHU_BASE_URL,
});

const assertTransportConfigured = (transport: FeishuTransportConfig) => {
  if (!(transport.enabled && transport.appId && transport.appSecret)) {
    throw new Error(
      "Feishu integration is not configured. Save app credentials in Settings > Feishu or set NEOBUNI_FEISHU_APP_ID and NEOBUNI_FEISHU_APP_SECRET."
    );
  }
};

const buildAccessTokenCacheKey = (input: {
  profileId: string;
  transport: FeishuTransportConfig;
}) =>
  [input.profileId, input.transport.appId, input.transport.baseUrl].join("::");

const getCachedTenantAccessToken = async (input: {
  profileId: string;
  transport: FeishuTransportConfig;
}) => {
  const now = Date.now();
  const cacheKey = buildAccessTokenCacheKey(input);
  const cachedAccessToken = cachedAccessTokenByKey.get(cacheKey);

  if (cachedAccessToken && cachedAccessToken.expiresAtMs > now + 60_000) {
    return cachedAccessToken.token;
  }

  const response = await fetch(
    `${input.transport.baseUrl}/auth/v3/tenant_access_token/internal`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        app_id: input.transport.appId,
        app_secret: input.transport.appSecret,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch Feishu tenant access token (${response.status}): ${errorText}`
    );
  }

  const json = (await response.json()) as {
    tenant_access_token?: string;
    expire?: number;
    msg?: string;
  };

  if (!json.tenant_access_token) {
    throw new Error(
      json.msg ?? "Feishu tenant access token response was missing token."
    );
  }

  cachedAccessTokenByKey.set(cacheKey, {
    token: json.tenant_access_token,
    expiresAtMs: now + Math.max(60, json.expire ?? 7200) * 1000,
  });

  return json.tenant_access_token;
};

const getEnabledTargets = (config: FeishuConfig): ResolvedFeishuTarget[] =>
  config.targets
    .filter((target) => target.enabled)
    .map((target) => ({
      alias: target.alias,
      label: target.label,
      receiveIdType: target.receiveIdType,
      receiveId: target.receiveId,
      enabled: target.enabled,
    }));

const resolveTarget = (
  config: FeishuConfig,
  input: Pick<
    SendFeishuMessageInput,
    "targetAlias" | "receiveIdType" | "receiveId"
  >
) => {
  const enabledTargets = getEnabledTargets(config);

  if (input.targetAlias) {
    const target = enabledTargets.find(
      (item) => item.alias === input.targetAlias
    );

    if (!target) {
      throw new Error(
        `Unknown Feishu target alias: ${input.targetAlias}. Configure a target alias in Settings > Feishu or pass an explicit receiveIdType plus receiveId.`
      );
    }

    return {
      alias: input.targetAlias,
      receiveIdType: target.receiveIdType,
      receiveId: target.receiveId,
    };
  }

  if (
    !(input.receiveIdType || input.receiveId) &&
    enabledTargets.length === 1
  ) {
    const target = enabledTargets[0]!;

    return {
      alias: target.alias,
      receiveIdType: target.receiveIdType,
      receiveId: target.receiveId,
    };
  }

  if (!(input.receiveIdType && input.receiveId)) {
    throw new Error(
      "send_feishu_message requires targetAlias or explicit receiveIdType plus receiveId. If exactly one Feishu target is enabled, omitting all target fields will use it automatically."
    );
  }

  return {
    alias: null,
    receiveIdType: input.receiveIdType,
    receiveId: input.receiveId,
  };
};

const buildMessagePayload = (message: FeishuMessagePayload) =>
  message.type === "text"
    ? {
        msgType: "text" as const,
        content: JSON.stringify({
          text: message.text,
        }),
        messageType: "text" as const,
        preview:
          message.text.length > 240
            ? `${message.text.slice(0, 240)}...`
            : message.text,
      }
    : {
        msgType: "interactive" as const,
        content: JSON.stringify(message.card),
        messageType: "card" as const,
        preview:
          message.fallbackText.length > 240
            ? `${message.fallbackText.slice(0, 240)}...`
            : message.fallbackText,
      };

const sendFeishuMessage = async (
  profileId: string,
  input: SendFeishuMessageInput
): Promise<SendFeishuMessageResult> => {
  const config = await getEffectiveFeishuConfig(profileId);
  const transport = toTransportConfig(config);
  assertTransportConfigured(transport);
  const target = resolveTarget(config, input);
  const messagePayload = buildMessagePayload(input.message);
  const token = await getCachedTenantAccessToken({
    profileId,
    transport,
  });
  const response = await fetch(
    `${transport.baseUrl}/im/v1/messages?receive_id_type=${encodeURIComponent(target.receiveIdType)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        receive_id: target.receiveId,
        msg_type: messagePayload.msgType,
        content: messagePayload.content,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to send Feishu message (${response.status}): ${errorText}`
    );
  }

  const json = (await response.json()) as {
    data?: {
      message_id?: string;
    };
    msg?: string;
  };

  return {
    delivered: true,
    messageId: json.data?.message_id ?? null,
    target,
    messageType: messagePayload.messageType,
    preview: messagePayload.preview,
  };
};

const listFeishuTargets = async (
  profileId: string
): Promise<FeishuTargetSummary[]> => {
  const config = await getEffectiveFeishuConfig(profileId);

  return getEnabledTargets(config).map((target) => ({
    alias: target.alias,
    label: target.label.trim().length > 0 ? target.label : null,
    receiveIdType: target.receiveIdType,
    receiveIdPreview: previewReceiveId(target.receiveId),
  }));
};

export type {
  FeishuTargetSummary,
  SendFeishuMessageInput,
  SendFeishuMessageResult,
};
export {
  getEffectiveFeishuConfig,
  listFeishuTargets,
  previewReceiveId,
  resetFeishuAccessTokenCacheForTest,
  saveFeishuConfig,
  sendFeishuMessage,
};
