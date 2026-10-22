import type { ProviderPromptPacket } from "@neobuni/contracts";
import { describe, expect, test } from "vitest";

import { getSurfacePolicy } from "./surface-policy";
import { applySurfacePromptPolicy } from "./surface-prompt";

const promptPacket: ProviderPromptPacket = {
  systemPrompt: "Base prompt",
  sections: [
    {
      key: "identity",
      title: "Identity",
      body: "You are Buni.",
    },
  ],
  compiledExpression: null,
};

describe("applySurfacePromptPolicy", () => {
  test("adds group-safe visibility guidance for chat_public_safe prompts", () => {
    const result = applySurfacePromptPolicy({
      promptPacket,
      surfacePolicy: getSurfacePolicy("chat_public_safe"),
    });

    expect(result.systemPrompt).toContain("group-safe public surface");
    expect(result.systemPrompt).toContain(
      "Do not rely on private autobiographical context"
    );
    expect(result.sections).toEqual(promptPacket.sections);
  });

  test("keeps private prompts unchanged", () => {
    const result = applySurfacePromptPolicy({
      promptPacket,
      surfacePolicy: getSurfacePolicy("chat_private"),
    });

    expect(result).toEqual(promptPacket);
  });
});
