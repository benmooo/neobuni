import type { ReactNode } from "react";

import { FormFieldBlock } from "@/components/form/FormFieldBlock";

interface AuthFieldProps {
  children: ReactNode;
  error?: string | null;
  hint?: string;
  htmlFor: string;
  label: string;
}

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
