import { describe, expect, test } from "vitest";
import { z } from "zod";

import { createBlurThenChangeValidators } from "./auth-form";

describe("createBlurThenChangeValidators", () => {
  test("reuses the same schema for blur, change, and submit validation", () => {
    const schema = z.object({
      email: z.email("请输入有效的邮箱地址。"),
    });

    expect(createBlurThenChangeValidators(schema)).toEqual({
      onBlur: schema,
      onChange: schema,
      onSubmit: schema,
    });
  });
});
