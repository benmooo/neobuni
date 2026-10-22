import { describe, expect, test } from "vitest";

import { stripUnsupportedDeepSeekToolFields } from "./deepseek-anthropic-adapter";

describe("stripUnsupportedDeepSeekToolFields", () => {
  test("removes custom tool type for DeepSeek Anthropic compatibility", () => {
    const result = stripUnsupportedDeepSeekToolFields({
      tools: [
        {
          name: "recall_memory",
          type: "custom",
          description: "Recall memory",
          input_schema: {
            type: "object",
            properties: {},
          },
        },
      ],
    });

    expect(result).toEqual({
      tools: [
        {
          name: "recall_memory",
          description: "Recall memory",
          input_schema: {
            type: "object",
            properties: {},
          },
        },
      ],
    });
  });

  test("preserves non-custom tools", () => {
    const result = stripUnsupportedDeepSeekToolFields({
      tools: [
        {
          name: "web_search",
          type: "web_search_20250305",
        },
      ],
    });

    expect(result).toEqual({
      tools: [
        {
          name: "web_search",
          type: "web_search_20250305",
        },
      ],
    });
  });
});
