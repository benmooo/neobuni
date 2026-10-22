import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  listQqTargets,
  resetQqAccessTokenCacheForTest,
  sendQqMessage,
} from "./qq";

const originalEnv = {
  appId: process.env.NEOBUNI_QQ_APP_ID,
  appSecret: process.env.NEOBUNI_QQ_APP_SECRET,
  baseUrl: process.env.NEOBUNI_QQ_BASE_URL,
  targetsJson: process.env.NEOBUNI_QQ_TARGETS_JSON,
};

const originalFetch = globalThis.fetch;

describe("qq integration", () => {
  beforeEach(() => {
    process.env.NEOBUNI_QQ_APP_ID = "qq_app_123";
    process.env.NEOBUNI_QQ_APP_SECRET = "qq_secret_123";
    process.env.NEOBUNI_QQ_BASE_URL = "https://api.sgroup.qq.com";
    process.env.NEOBUNI_QQ_TARGETS_JSON = JSON.stringify({
      family_group: {
        targetType: "group_openid",
        targetId: "group_openid_123",
      },
      best_friend: {
        targetType: "user_openid",
        targetId: "user_openid_456",
      },
    });
    resetQqAccessTokenCacheForTest();
  });

  afterEach(() => {
    process.env.NEOBUNI_QQ_APP_ID = originalEnv.appId;
    process.env.NEOBUNI_QQ_APP_SECRET = originalEnv.appSecret;
    process.env.NEOBUNI_QQ_BASE_URL = originalEnv.baseUrl;
    process.env.NEOBUNI_QQ_TARGETS_JSON = originalEnv.targetsJson;
    globalThis.fetch = originalFetch;
    resetQqAccessTokenCacheForTest();
  });

  test("fetches an access token and sends a group text message through the resolved alias", async () => {
    const calls: Array<{
      url: string;
      method: string;
      body: string;
      headers: Record<string, string>;
    }> = [];

    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? init.body : "";
      const headers = Object.fromEntries(
        Object.entries(init?.headers ?? {}).map(([key, value]) => [
          key,
          String(value),
        ])
      );

      calls.push({
        url,
        method,
        body,
        headers,
      });

      if (url === "https://bots.qq.com/app/getAppAccessToken") {
        return new Response(
          JSON.stringify({
            access_token: "qq_access_token_123",
            expires_in: 7200,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      }

      return new Response(
        JSON.stringify({
          id: "qq_message_123",
          timestamp: 1_716_000_000,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }) as typeof fetch;

    const result = await sendQqMessage("profile-qq-test-1", {
      targetAlias: "family_group",
      message: {
        type: "text",
        text: "今晚八点吃饭",
      },
    });

    expect(result.delivered).toBe(true);
    expect(result.messageId).toBe("qq_message_123");
    expect(result.target.alias).toBe("family_group");
    expect(result.target.targetType).toBe("group_openid");
    expect(result.target.targetId).toBe("group_openid_123");
    expect(result.deliveryMode).toBe("active");
    expect(result.messageType).toBe("text");
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe("https://bots.qq.com/app/getAppAccessToken");
    expect(calls[1]?.url).toBe(
      "https://api.sgroup.qq.com/v2/groups/group_openid_123/messages"
    );
    expect(calls[1]?.headers.Authorization).toBe("QQBot qq_access_token_123");
    expect(JSON.parse(calls[1]?.body ?? "{}")).toEqual({
      content: "今晚八点吃饭",
      msg_type: 0,
    });
  });

  test("uses the only enabled target and includes passive reply context when provided", async () => {
    process.env.NEOBUNI_QQ_TARGETS_JSON = JSON.stringify({
      best_friend: {
        targetType: "user_openid",
        targetId: "user_openid_456",
      },
    });

    const calls: Array<{
      url: string;
      method: string;
      body: string;
      headers: Record<string, string>;
    }> = [];

    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? init.body : "";
      const headers = Object.fromEntries(
        Object.entries(init?.headers ?? {}).map(([key, value]) => [
          key,
          String(value),
        ])
      );

      calls.push({
        url,
        method,
        body,
        headers,
      });

      if (url === "https://bots.qq.com/app/getAppAccessToken") {
        return new Response(
          JSON.stringify({
            access_token: "qq_access_token_456",
            expires_in: 7200,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      }

      return new Response(
        JSON.stringify({
          id: "qq_message_456",
          timestamp: 1_716_000_100,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }) as typeof fetch;

    const result = await sendQqMessage("profile-qq-test-1", {
      message: {
        type: "text",
        text: "收到，我来处理",
      },
      eventId: "event_123",
      msgId: "msg_123",
      msgSeq: 2,
    });

    expect(result.delivered).toBe(true);
    expect(result.messageId).toBe("qq_message_456");
    expect(result.target.alias).toBe("best_friend");
    expect(result.target.targetType).toBe("user_openid");
    expect(result.target.targetId).toBe("user_openid_456");
    expect(result.deliveryMode).toBe("passive");
    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toBe(
      "https://api.sgroup.qq.com/v2/users/user_openid_456/messages"
    );
    expect(JSON.parse(calls[1]?.body ?? "{}")).toEqual({
      content: "收到，我来处理",
      msg_type: 0,
      event_id: "event_123",
      msg_id: "msg_123",
      msg_seq: 2,
    });
  });

  test("lists enabled qq targets with masked ids", async () => {
    process.env.NEOBUNI_QQ_TARGETS_JSON = JSON.stringify({
      family_group: {
        targetType: "group_openid",
        targetId: "group_openid_123456",
      },
      disabled_target: {
        targetType: "user_openid",
        targetId: "user_openid_999999",
        enabled: false,
      },
    });

    const result = await listQqTargets("profile-qq-test-1");

    expect(result).toEqual([
      {
        alias: "family_group",
        label: null,
        targetType: "group_openid",
        targetIdPreview: "grou...3456",
      },
    ]);
  });
});
