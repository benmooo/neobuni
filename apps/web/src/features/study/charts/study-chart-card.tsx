import { Card } from "@neobuni/ui/components/card";
import type { ReactNode } from "react";

import { EYEBROW, META } from "../lesson/styles";
import {
  CHART_CARD,
  CHART_CARD_BODY,
  CHART_CARD_FOOTER,
  CHART_CARD_HEADER,
} from "./chart-tokens";

export const CHART_EMPTY_BODY =
  "flex items-center justify-center border border-border border-dashed text-muted-foreground text-xs";

export function StudyChartEmpty({
  height,
  label,
}: {
  height: string;
  label: string;
}) {
  return <div className={`${CHART_EMPTY_BODY} ${height}`}>{label}</div>;
}

interface StudyChartCardProps {
  children: ReactNode;
  footer?: ReactNode;
  meta?: string;
  title: string;
}

export function StudyChartCard({
  children,
  footer,
  meta,
  title,
}: StudyChartCardProps) {
  return (
    <Card className={CHART_CARD}>
      <div className={CHART_CARD_HEADER}>
        <span className={EYEBROW}>{title}</span>
        {meta ? <span className={META}>{meta}</span> : null}
      </div>
      <div className={CHART_CARD_BODY}>{children}</div>
      {footer ? <div className={CHART_CARD_FOOTER}>{footer}</div> : null}
    </Card>
  );
}
