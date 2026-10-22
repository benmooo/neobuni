import type { ReactNode } from "react";

import { FormFieldBlock } from "@/components/form/FormFieldBlock";

type AuthFieldProps = {
	label: string;
	htmlFor: string;
	hint?: string;
	error?: string | null;
	children: ReactNode;
};

function AuthField({ label, htmlFor, hint, error, children }: AuthFieldProps) {
	return (
		<FormFieldBlock
			error={error}
			htmlFor={htmlFor}
			label={hint ? `${label} · ${hint}` : label}
		>
			{children}
		</FormFieldBlock>
	);
}

export { AuthField };
