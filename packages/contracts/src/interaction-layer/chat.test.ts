import { describe, expect, test } from "vitest";

import { chatForwardedPropsSchema } from "./chat";

describe("chatForwardedPropsSchema", () => {
  test("accepts AG-UI forwarded props used by the chat runtime", () => {
    const parsed = chatForwardedPropsSchema.parse({
      conversationId: "conversation-1",
      timezone: "Asia/Shanghai",
      featureFlag: "ag-ui",
    });

    expect(parsed.conversationId).toBe("conversation-1");
    expect(parsed.timezone).toBe("Asia/Shanghai");
    expect(parsed.featureFlag).toBe("ag-ui");
  });
});
