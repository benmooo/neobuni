import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@neobuni/ui/components/card";
import { FieldDescription, FieldError } from "@neobuni/ui/components/field";
import { cn } from "@neobuni/ui/lib/utils";
import type { ReactNode } from "react";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

function SectionGroup({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="px-1">
        <h2 className="font-semibold text-base tracking-tight">{title}</h2>
        <p className="mt-1 text-muted-foreground text-xs">{description}</p>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function FieldHint({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "destructive";
}) {
  return tone === "destructive" ? (
    <FieldError>{children}</FieldError>
  ) : (
    <FieldDescription className={cn("text-xs")}>{children}</FieldDescription>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="font-medium text-sm">{value}</div>
      </CardContent>
    </Card>
  );
}

const getMutationErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "保存失败，请检查配置后重试。";

export {
  FieldHint,
  getMutationErrorMessage,
  Section,
  SectionGroup,
  SummaryChip,
};
