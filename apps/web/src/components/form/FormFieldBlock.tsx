import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
} from "@neobuni/ui/components/field";
import type { ReactNode } from "react";

interface FormFieldBlockProps {
  children: ReactNode;
  error?: string | null;
  hint?: string;
  htmlFor?: string;
  label: string;
}

function FormFieldBlock({
  label,
  htmlFor,
  hint,
  error,
  children,
}: FormFieldBlockProps) {
  return (
    <Field>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      <FieldContent>
        {children}
        {hint ? <FieldDescription>{hint}</FieldDescription> : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </FieldContent>
    </Field>
  );
}

interface FormToggleFieldProps {
  children: ReactNode;
  description?: string;
  label: string;
}

function FormToggleField({
  label,
  description,
  children,
}: FormToggleFieldProps) {
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldTitle>{label}</FieldTitle>
        {description ? (
          <FieldDescription>{description}</FieldDescription>
        ) : null}
      </FieldContent>
      {children}
    </Field>
  );
}

export { FormFieldBlock, FormToggleField };
