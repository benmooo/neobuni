import { describe, expect, test } from "vitest";

import { runtimeSurfaceSchema, surfacePolicySchema } from "./surface";

describe("runtime surface contracts", () => {
  test("parses the public-safe surface policy", () => {
    const parsed = surfacePolicySchema.parse({
      surface: "chat_public_safe",
      allowMemoryRecall: false,
      allowMemoryWrite: false,
      allowAutobiographicalContext: false,
      allowScheduleMutation: true,
      toolAllowlist: ["search_web", "send_channel_message"],
      responseVisibility: "group",
    });

    expect(parsed.surface).toBe("chat_public_safe");
    expect(parsed.responseVisibility).toBe("group");
  });

  test("rejects unknown runtime surfaces", () => {
    expect(() => runtimeSurfaceSchema.parse("discord_unsafe")).toThrow();
  });
});
