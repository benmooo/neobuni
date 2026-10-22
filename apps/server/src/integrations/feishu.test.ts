import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  resetFeishuAccessTokenCacheForTest,
  sendFeishuMessage,
} from "./feishu";

const originalEnv = {
  appId: process.env.NEOBUNI_FEISHU_APP_ID,
  appSecret: process.env.NEOBUNI_FEISHU_APP_SECRET,
  baseUrl: process.env.NEOBUNI_FEISHU_BASE_URL,
  targetsJson: process.env.NEOBUNI_FEISHU_TARGETS_JSON,
};

const originalFetch = globalThis.fetch;

describe("sendFeishuMessage", () => {
  beforeEach(() => {
    process.env.NEOBUNI_FEISHU_APP_ID = "cli_test_app";
    process.env.NEOBUNI_FEISHU_APP_SECRET = "cli_test_secret";
    process.env.NEOBUNI_FEISHU_BASE_URL = "https://feishu.example.com/open-apis";
    process.env.NEOBUNI_FEISHU_TARGETS_JSON = JSON.stringify({
      daily_sync: {
        receiveIdType: "chat_id",
        receiveId: "oc_test_chat",
      },
    });
    resetFeishuAccessTokenCacheForTest();
  });

  afterEach(() => {
    process.env.NEOBUNI_FEISHU_APP_ID = originalEnv.appId;
    process.env.NEOBUNI_FEISHU_APP_SECRET = originalEnv.appSecret;
    process.env.NEOBUNI_FEISHU_BASE_URL = originalEnv.baseUrl;
    process.env.NEOBUNI_FEISHU_TARGETS_JSON = originalEnv.targetsJson;
    globalThis.fetch = originalFetch;
    resetFeishuAccessTokenCacheForTest();
  });

  test("fetches a tenant token and sends a text message through the resolved alias", async () => {
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
        ]),
      );

      calls.push({
        url,
        method,
        body,
        headers,
      });

      if (url.endsWith("/auth/v3/tenant_access_token/internal")) {
        return new Response(
          JSON.stringify({
            tenant_access_token: "tenant_token_123",
            expire: 7200,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }

      return new Response(
        JSON.stringify({
          data: {
            message_id: "om_message_123",
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }) as typeof fetch;

    const result = await sendFeishuMessage("profile-feishu-test-1", {
      targetAlias: "daily_sync",
      message: {
        type: "text",
        text: "Reflection report ready",
      },
    });

    expect(result.delivered).toBe(true);
    expect(result.messageId).toBe("om_message_123");
    expect(result.target.alias).toBe("daily_sync");
    expect(result.target.receiveIdType).toBe("chat_id");
    expect(result.target.receiveId).toBe("oc_test_chat");
    expect(result.messageType).toBe("text");
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe(
      "https://feishu.example.com/open-apis/auth/v3/tenant_access_token/internal",
    );
    expect(calls[1]?.url).toBe(
      "https://feishu.example.com/open-apis/im/v1/messages?receive_id_type=chat_id",
    );
    expect(JSON.parse(calls[1]?.body ?? "{}")).toEqual({
      receive_id: "oc_test_chat",
      msg_type: "text",
      content: JSON.stringify({
        text: "Reflection report ready",
      }),
    });
  });

  test("uses the only enabled target when no target fields are provided", async () => {
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
        ]),
      );

      calls.push({
        url,
        method,
        body,
        headers,
      });

      if (url.endsWith("/auth/v3/tenant_access_token/internal")) {
        return new Response(
          JSON.stringify({
            tenant_access_token: "tenant_token_123",
            expire: 7200,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }

      return new Response(
        JSON.stringify({
          data: {
            message_id: "om_message_456",
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }) as typeof fetch;

    const result = await sendFeishuMessage("profile-feishu-test-1", {
      message: {
        type: "text",
        text: "Reflection report ready",
      },
    });

    expect(result.delivered).toBe(true);
    expect(result.messageId).toBe("om_message_456");
    expect(result.target.alias).toBe("daily_sync");
    expect(result.target.receiveIdType).toBe("chat_id");
    expect(result.target.receiveId).toBe("oc_test_chat");
    expect(result.messageType).toBe("text");
    expect(calls).toHaveLength(2);
  });

  test("sends an interactive card message with fallback preview", async () => {
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
        ]),
      );

      calls.push({
        url,
        method,
        body,
        headers,
      });

      if (url.endsWith("/auth/v3/tenant_access_token/internal")) {
        return new Response(
          JSON.stringify({
            tenant_access_token: "tenant_token_123",
            expire: 7200,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }

      return new Response(
        JSON.stringify({
          data: {
            message_id: "om_message_card_123",
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }) as typeof fetch;

    const card = {
      header: {
        title: {
          tag: "plain_text",
          content: "Yesterday Daily Report",
        },
      },
      elements: [
        {
          tag: "markdown",
          content: "Summary",
        },
      ],
    };

    const result = await sendFeishuMessage("profile-feishu-test-1", {
      targetAlias: "daily_sync",
      message: {
        type: "card",
        card,
        fallbackText: "Yesterday Daily Report\n\nSummary",
      },
    });

    expect(result.delivered).toBe(true);
    expect(result.messageId).toBe("om_message_card_123");
    expect(result.messageType).toBe("card");
    expect(result.preview).toBe("Yesterday Daily Report\n\nSummary");
    expect(JSON.parse(calls[1]?.body ?? "{}")).toEqual({
      receive_id: "oc_test_chat",
      msg_type: "interactive",
      content: JSON.stringify(card),
    });
  });
});
