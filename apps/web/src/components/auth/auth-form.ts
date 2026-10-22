import { readValidationMessage } from "@/lib/form-errors";

const createBlurThenChangeValidators = <TSchema>(schema: TSchema) => ({
	onBlur: schema,
	onChange: schema,
	onSubmit: schema,
});

export { createBlurThenChangeValidators, readValidationMessage };
