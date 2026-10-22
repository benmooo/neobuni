import type { ValidationError } from "@tanstack/react-form";
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

export { readValidationMessage, validateCompositeForm };
