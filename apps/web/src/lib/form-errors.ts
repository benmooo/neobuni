import type {
  AnyFormApi,
  ValidationError,
  ValidationLogicFn,
  ValidationLogicValidatorsFn,
} from "@tanstack/react-form";
import type { z } from "zod";

// Use a form-level error for composite inputs whose nested fields are not registered.
const validateCompositeForm = (
  schema: z.ZodType,
  value: unknown
): string | undefined => {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
};

const readValidationMessage = (
  errors: ValidationError[] | undefined
): string | null => {
  for (const error of errors ?? []) {
    if (typeof error === "string" && error.length > 0) {
      return error;
    }

    if (error && typeof error === "object") {
      if ("message" in error && typeof error.message === "string") {
        return error.message;
      }

      if ("form" in error && Array.isArray(error.form)) {
        const nested = readValidationMessage(error.form as ValidationError[]);

        if (nested) {
          return nested;
        }
      }

      if (
        "fields" in error &&
        error.fields &&
        typeof error.fields === "object"
      ) {
        const nested = readValidationMessage(
          Object.values(error.fields).flat() as ValidationError[]
        );

        if (nested) {
          return nested;
        }
      }

      // Standard Schema form errors are maps of field paths to issue arrays.
      const issues = Object.values(error).filter(Array.isArray).flat();
      const message = readValidationMessage(issues as ValidationError[]);
      if (message) {
        return message;
      }
    }
  }

  return null;
};

// A field counts as "left behind" once it has been blurred, and the whole form
// once it has been submitted. Until then edits stay silent so nothing flashes
// while the first characters are typed.
const hasLeftAField = (form: AnyFormApi): boolean =>
  form.state.submissionAttempts > 0 ||
  Object.values(form.state.fieldMeta).some((meta) => meta?.isBlurred === true);

/**
 * Validation strategy to pair with a single `onDynamic` validator.
 *
 * TanStack Form keeps one error entry per validation cause, so a field that was
 * validated on blur keeps its blur error even after a later change passes.
 * Routing every cause through `onDynamic` means each run overwrites the
 * previous message, so an error disappears as soon as the value is fixed.
 *
 * Runs on blur and submit always, and on change once `hasLeftAField` is true.
 */
const blurThenChangeValidationLogic: ValidationLogicFn = (props) => {
  const { event, form, validators } = props;

  if (event.type === "mount" || event.type === "server") {
    return props.runValidation({ form, validators: [] });
  }

  const shouldValidate =
    event.type === "blur" || event.type === "submit" || hasLeftAField(form);

  const dynamicValidator: ValidationLogicValidatorsFn | undefined =
    shouldValidate
      ? {
          cause: "dynamic",
          fn: event.async ? validators?.onDynamicAsync : validators?.onDynamic,
        }
      : undefined;

  return props.runValidation({ form, validators: [dynamicValidator] });
};

const blurThenChangeValidation = <TValidator>(validator: TValidator) => ({
  validators: { onDynamic: validator },
  validationLogic: blurThenChangeValidationLogic,
});

export {
  blurThenChangeValidation,
  blurThenChangeValidationLogic,
  readValidationMessage,
  validateCompositeForm,
};
