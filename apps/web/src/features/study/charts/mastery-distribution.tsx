import type { StudyMastery, StudyPlanNode } from "@neobuni/contracts";

import { META } from "../lesson/styles";
import {
  BAND_FILLS,
  BAND_LABELS,
  bandOf,
  type MasteryBand,
} from "./mastery-bands";

const BAND_ORDER: MasteryBand[] = [
  "high",
  "mid",
  "low",
  "studied",
  "untouched",
];

interface MasteryDistributionProps {
  completed: Set<string>;
  masteryByNode: Map<string, StudyMastery>;
  nodes: StudyPlanNode[];
}

export function MasteryDistribution({
  completed,
  masteryByNode,
  nodes,
}: MasteryDistributionProps) {
  const lessons = nodes.filter((node) => node.kind === "lesson");
  const counts = new Map<MasteryBand, number>(
    BAND_ORDER.map((band) => [band, 0])
  );

  for (const lesson of lessons) {
    const band = bandOf(masteryByNode.get(lesson.id), completed.has(lesson.id));
    counts.set(band, (counts.get(band) ?? 0) + 1);
  }

  if (lessons.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">还没有生成课程节点。</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex h-2 w-full overflow-hidden bg-muted">
        {BAND_ORDER.map((band) => {
          const count = counts.get(band) ?? 0;
          if (count === 0) {
            return null;
          }
          return (
            <div
              className={BAND_FILLS[band]}
              key={band}
              style={{ width: `${(count / lessons.length) * 100}%` }}
              title={`${BAND_LABELS[band]} · ${count} 节`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
        {BAND_ORDER.map((band) => (
          <span className="flex items-center gap-1.5" key={band}>
            <span className={`h-2 w-2 shrink-0 ${BAND_FILLS[band]}`} />
            <span className="text-[0.6875rem] text-muted-foreground">
              {BAND_LABELS[band]}
            </span>
            <span className={`${META} ml-auto`}>{counts.get(band) ?? 0}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
