import { FieldApi, FormApi } from "@tanstack/react-form";
import { describe, expect, test } from "vitest";
import { z } from "zod";

import { messagingTargetFormSchema } from "../features/settings/messaging-settings-model";
import {
  blurThenChangeValidation,
  readValidationMessage,
  validateCompositeForm,
} from "./form-errors";

describe("messaging form validation feedback", () => {
  test("reads field issue maps returned by Standard Schema validation", () => {
    expect(
      readValidationMessage([
        { "targets[0].alias": [{ message: "Invalid alias" }] },
      ])
    ).toBe("Invalid alias");
    expect(
      readValidationMessage([
        { fields: { "targets[0].alias": [{ message: "Invalid alias" }] } },
      ])
    ).toBe("Invalid alias");
  });

  test("shows nested alias errors and allows submission after correcting the alias", async () => {
    const schema = z.object({ targets: z.array(messagingTargetFormSchema) });
    let submissions = 0;
    const form = new FormApi({
      defaultValues: {
        targets: [
          {
            alias: "matt & xx",
            label: "朋友群",
            targetType: "group",
            targetId: "-5347003028",
            enabled: true,
            metadata: {},
          },
        ],
      } as z.infer<typeof schema>,
      validators: {
        onChange: ({ value }) => validateCompositeForm(schema, value),
        onSubmit: ({ value }) => validateCompositeForm(schema, value),
      },
      onSubmit: () => {
        submissions += 1;
      },
    });
    const unmount = form.mount();
    const field = new FieldApi({ form, name: "targets" });
    const unmountField = field.mount();

    try {
      await form.handleSubmit();
      expect(submissions).toBe(0);
      expect(form.state.canSubmit).toBe(false);
      expect(readValidationMessage(form.state.errors)).toContain(
        "Alias must start"
      );

      field.handleChange(
        form.state.values.targets.map((target) => ({
          ...target,
          alias: "matt_xx",
        }))
      );
      await field.validate("change");
      expect(readValidationMessage(form.state.errors)).toBeNull();
      expect(form.state.canSubmit).toBe(true);
      await form.handleSubmit();
      expect(submissions).toBe(1);
    } finally {
      unmountField();
      unmount();
    }
  });
});

describe("blurThenChangeValidation", () => {
  const schema = z.object({
    email: z.email("请输入有效的邮箱地址。"),
    name: z.string().min(1, "请输入昵称。"),
  });

  const setupForm = () => {
    let submissions = 0;
    const form = new FormApi({
      defaultValues: { email: "", name: "" },
      ...blurThenChangeValidation(schema),
      onSubmit: () => {
        submissions += 1;
      },
    });
    const unmountForm = form.mount();
    const emailField = new FieldApi({ form, name: "email" });
    const unmountField = emailField.mount();

    return {
      emailField,
      form,
      getSubmissions: () => submissions,
      cleanup: () => {
        unmountField();
        unmountForm();
      },
    };
  };

  test("stays quiet while the first characters are typed", () => {
    const { emailField, form, cleanup } = setupForm();

    try {
      emailField.handleChange("not-an-email");

      expect(readValidationMessage(emailField.state.meta.errors)).toBeNull();
      expect(form.state.canSubmit).toBe(true);
    } finally {
      cleanup();
    }
  });

  test("validates on change once the field was blurred", () => {
    const { emailField, cleanup } = setupForm();

    try {
      emailField.handleBlur();
      expect(readValidationMessage(emailField.state.meta.errors)).toBe(
        "请输入有效的邮箱地址。"
      );

      emailField.handleChange("buni@example.com");
      expect(readValidationMessage(emailField.state.meta.errors)).toBeNull();

      emailField.handleChange("still-not-an-email");
      expect(readValidationMessage(emailField.state.meta.errors)).toBe(
        "请输入有效的邮箱地址。"
      );
    } finally {
      cleanup();
    }
  });

  test("validates on change after a failed submission", async () => {
    const { emailField, form, getSubmissions, cleanup } = setupForm();

    try {
      await form.handleSubmit();
      expect(getSubmissions()).toBe(0);
      expect(readValidationMessage(emailField.state.meta.errors)).toBe(
        "请输入有效的邮箱地址。"
      );

      emailField.handleChange("buni@example.com");
      expect(readValidationMessage(emailField.state.meta.errors)).toBeNull();

      emailField.handleChange("still-not-an-email");
      expect(readValidationMessage(emailField.state.meta.errors)).toBe(
        "请输入有效的邮箱地址。"
      );
    } finally {
      cleanup();
    }
  });
});
